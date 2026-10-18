/**
 * The `presmium-service` row (docs/design-dsh.md 6.2): the workspace service
 * the bundle works with, and each DeepSeek Harness session's place in it.
 *
 * With the service's address and token in the environment
 * (`PRESMIUM_SERVICE_URL`, `PRESMIUM_SERVICE_TOKEN`: `presmium studio` starts
 * the service) the row uses that service. Otherwise it starts `presmium serve
 * --headless` itself, with a service token of its own, in a process group
 * under a watchdog that ends the group when this process goes, killed with
 * SIGKILL included.
 * The service's environment has no model credentials: the deck's code runs
 * there, never in this process (1.2).
 *
 * A session belongs to the document whose directory is the session's working
 * directory, never this process's (6.2): the web host runs a session in the
 * workspace the user picked. Its tools, policy and context come from that
 * document; a session in no document's directory gets none of Presmium's. The
 * first time a session needs them, the row asks the service for a session
 * token (`presmium.server/tokens`, bound to the document and confirmed, 5.3),
 * connects to `/mcp` with it and lists the document's tools; the token is
 * revoked when the session goes. The other rows reach all this through the
 * `presmium` service the row provides.
 */
import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { connectPresmiumMcp } from '@presmium/mcp/client'
import type { ListedTool, PresmiumMcpClient } from '@presmium/mcp/client'
import type { DshAgent, DshContext, DshLogger } from './dsh.ts'

export const name = 'presmium-service'

export interface Config {
  /** The workspace service's address (`PRESMIUM_SERVICE_URL`); without it the row starts `presmium serve`. */
  url?: string
  /** Its service token (`PRESMIUM_SERVICE_TOKEN`). */
  token?: string
  /** The workspace root (`PRESMIUM_WORKSPACE`, else the directory dsh started in): where the service runs, what the documents' directories are relative to. */
  root?: string
}

/** The workspace service: its address, its token and the workspace root. */
export interface Endpoint {
  url: string
  token: string
  root: string
}

/** A document of the workspace, as the service lists it. */
export interface WorkspaceDocument {
  /** Relative to the workspace root; '' in a repository of one deck. */
  dir: string
  title: string
  lang?: string
}

/** What a session of DeepSeek Harness has of Presmium: its document, and the document's tools at `/mcp`. */
export interface PresmiumSession {
  /** DeepSeek Harness's session id. */
  id: string
  document: WorkspaceDocument
  /** The document directory, absolute. */
  dir: string
  client: PresmiumMcpClient
  /** The document's tools as MCP lists them to the session's token. */
  tools: ListedTool[]
}

/** How long `presmium serve` may take to say where it listens. */
const START_MS = 180_000
/** How long the list of documents is kept before it is asked again. */
const DOCUMENTS_MS = 2000
/** This package's watchdog (`watchdog.mjs`), run by node directly. */
const WATCHDOG = fileURLToPath(new URL('./watchdog.mjs', import.meta.url))

/** The `presmium` command of `@presmium/cli`: its package's `bin/presmium.mjs`. */
function presmiumBin(): string {
  const entry = createRequire(import.meta.url).resolve('@presmium/cli')
  return join(dirname(dirname(entry)), 'bin', 'presmium.mjs')
}

function real(path: string): string {
  try {
    return realpathSync(path)
  } catch {
    return resolve(path)
  }
}

/** The document whose directory `dir` is, or undefined. */
export function documentAt(root: string, dir: string, documents: WorkspaceDocument[]): WorkspaceDocument | undefined {
  const rel = relative(real(root), real(dir)).split(sep).join('/')
  if (rel.startsWith('..')) return undefined
  return documents.find(doc => doc.dir === rel)
}

/** The service's environment: this process's, without DeepSeek Harness's variables and the model's credentials (1.2). */
function serviceEnv(token: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith('DSH_') || key.startsWith('DEEPSEEK_') || key === 'NODE_ENV') continue
    env[key] = value
  }
  return { ...env, PRESMIUM_SERVICE_TOKEN: token }
}

export class PresmiumService {
  readonly ready: Promise<Endpoint>
  readonly #ctx: DshContext
  readonly #log: DshLogger
  #child: ChildProcess | undefined
  #documents: { at: number, list: Promise<WorkspaceDocument[]> } | undefined
  readonly #opening = new Map<string, Promise<PresmiumSession | undefined>>()
  readonly #open = new Map<string, PresmiumSession>()
  #closed = false

  constructor(ctx: DshContext, config: Config, log: DshLogger) {
    this.#ctx = ctx
    this.#log = log
    const root = resolve(config.root || process.cwd())
    this.ready = config.url
      ? Promise.resolve({ url: config.url.replace(/\/+$/, ''), token: config.token ?? '', root })
      : this.#start(root)
    // Not left unhandled: a failure reaches whoever awaits it.
    this.ready.catch((error: unknown) => log.warn(`presmium-service: ${error instanceof Error ? error.message : String(error)}`))
  }

  /** Starts `presmium serve <root>` under the watchdog; resolves once it says where it listens. */
  #start(root: string): Promise<Endpoint> {
    const token = randomBytes(24).toString('base64url')
    const child = spawn(process.execPath, [WATCHDOG, process.execPath, presmiumBin(), 'serve', root, '--headless', '--port', '0'], {
      cwd: root,
      env: serviceEnv(token),
      // stdin stays open: it closing tells the watchdog this process is gone.
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: true,
    })
    this.#child = child
    child.stdin!.on('error', () => {})
    let output = ''
    return new Promise<Endpoint>((resolveStart, reject) => {
      const timer = setTimeout(() => reject(new Error(`presmium serve did not start within ${START_MS / 1000} s:\n${output.slice(-2000)}`)), START_MS)
      const read = (chunk: Buffer) => {
        output = (output + chunk.toString()).slice(-20_000)
        const url = /^serve {2}(http\S+)$/m.exec(output)?.[1]
        const workspace = /^workspace {2}(.+)$/m.exec(output)?.[1]
        if (url && workspace) {
          clearTimeout(timer)
          resolveStart({ url, token, root: workspace.trim() })
        }
      }
      child.stdout!.on('data', read)
      child.stderr!.on('data', (chunk: Buffer) => {
        output = (output + chunk.toString()).slice(-20_000)
        for (const line of chunk.toString().split('\n').filter(Boolean)) this.#log.debug(`presmium serve: ${line}`)
      })
      child.once('exit', (code, signal) => {
        clearTimeout(timer)
        if (!this.#closed) this.#log.warn(`presmium serve exited (${signal ?? code})`)
        reject(new Error(`presmium serve exited (${signal ?? code}):\n${output.slice(-2000)}`))
      })
    })
  }

  /** A request to the workspace service with the service token: `body` as JSON, or `raw` as it is. */
  async request(path: string, init: { method?: string, body?: unknown, raw?: ArrayBuffer, headers?: Record<string, string>, signal?: AbortSignal } = {}): Promise<Response> {
    const { url, token } = await this.ready
    const json = init.body !== undefined
    return fetch(`${url}${path}`, {
      method: init.method ?? (json || init.raw ? 'POST' : 'GET'),
      headers: { ...json ? { 'Content-Type': 'application/json' } : {}, ...init.headers, ...token ? { Authorization: `Bearer ${token}` } : {} },
      ...json ? { body: JSON.stringify(init.body) } : init.raw ? { body: init.raw } : {},
      ...init.signal ? { signal: init.signal } : {},
    })
  }

  async #json<T>(path: string, init?: Parameters<PresmiumService['request']>[1]): Promise<T> {
    const response = await this.request(path, init)
    const text = await response.text()
    if (!response.ok) throw new Error(`${path} answered ${response.status}: ${text}`)
    return JSON.parse(text) as T
  }

  /** The workspace's documents, as the service lists them. */
  documents(): Promise<WorkspaceDocument[]> {
    if (!this.#documents || Date.now() - this.#documents.at > DOCUMENTS_MS) {
      const list = this.#json<{ documents: WorkspaceDocument[] }>('/__presmium/presmium.workspace/documents').then(answer => answer.documents)
      this.#documents = { at: Date.now(), list }
      list.catch(() => this.#documents = undefined)
    }
    return this.#documents.list
  }

  /** A session's working directory: its own (the web host's workspace of the session), not this process's. */
  directoryOf(agent: DshAgent): string {
    const dirs = this.#ctx.get('workingDirectory') as { get(session: unknown): string } | undefined
    try {
      return dirs?.get(agent.session) ?? agent.session.header?.cwd ?? process.cwd()
    } catch {
      return agent.session.header?.cwd ?? process.cwd()
    }
  }

  /** The session's Presmium side, once (it is kept while the session lives); undefined for a session in no document. */
  attach(agent: DshAgent): Promise<PresmiumSession | undefined> {
    const id = agent.session.id
    let known = this.#opening.get(id)
    if (!known) {
      known = this.#attach(agent).catch((error: unknown) => {
        this.#log.warn(`presmium-service: the session ${id} has no Presmium tools: ${error instanceof Error ? error.message : String(error)}`)
        this.#opening.delete(id)
        return undefined
      })
      this.#opening.set(id, known)
    }
    return known
  }

  async #attach(agent: DshAgent): Promise<PresmiumSession | undefined> {
    const { root } = await this.ready
    const id = agent.session.id
    const document = documentAt(root, this.directoryOf(agent), await this.documents())
    if (!document) return undefined
    const grant = await this.#json<{ url: string, token: string }>('/__presmium/presmium.server/tokens', { body: { document: document.dir, session: id } })
    const client = await connectPresmiumMcp(grant.url, grant.token)
    const session: PresmiumSession = { id, document, dir: resolve(root, document.dir), client, tools: await client.tools() }
    this.#open.set(id, session)
    return session
  }

  /** A session's Presmium side once attached; undefined before, or for a session in no document. */
  session(agent: DshAgent | undefined): PresmiumSession | undefined {
    return agent ? this.#open.get(agent.session.id) : undefined
  }

  /** A session went: its token is revoked. */
  async detach(id: string): Promise<void> {
    const session = this.#open.get(id)
    this.#open.delete(id)
    this.#opening.delete(id)
    if (!session) return
    await session.client.close().catch(() => undefined)
    await this.request('/__presmium/presmium.server/tokens', { method: 'DELETE', body: { session: id } }).then(r => r.body?.cancel(), () => undefined)
  }

  async close(): Promise<void> {
    this.#closed = true
    for (const session of this.#open.values()) await session.client.close().catch(() => undefined)
    this.#open.clear()
    this.#opening.clear()
    if (this.#child) {
      // The watchdog ends the service's group.
      this.#child.kill('SIGTERM')
      return
    }
    // A service of presmium studio's: this host's session tokens go.
    await this.request('/__presmium/presmium.server/tokens', { method: 'DELETE', body: {} }).then(r => r.body?.cancel(), () => undefined)
  }

  /** Ends the watchdog at once: for this process's exit, where nothing can be awaited. */
  stop(): void {
    this.#closed = true
    if (this.#child?.exitCode === null) this.#child.kill('SIGTERM')
  }
}

export function apply(ctx: DshContext, config: Config = {}): void {
  const log = ctx.logger?.('presmium') ?? console
  const service = new PresmiumService(ctx, config, log)
  ctx.provide('presmium', service)
  ctx.on('session/disposed', (session: { id: string }) => void service.detach(session.id))
  const stop = () => service.stop()
  process.once('exit', stop)
  ctx.effect(() => () => {
    process.off('exit', stop)
    void service.close()
  })
}
