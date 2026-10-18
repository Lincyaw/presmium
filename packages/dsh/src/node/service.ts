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
  url?: string
  token?: string
  root?: string
}

export interface Endpoint {
  url: string
  token: string
  root: string
}

export interface WorkspaceDocument {
  dir: string
  title: string
  lang?: string
}

export interface PresmiumSession {
  id: string
  document: WorkspaceDocument
  dir: string
  client: PresmiumMcpClient
  tools: ListedTool[]
}

const START_MS = 180_000
const DOCUMENTS_MS = 2000
const WATCHDOG = fileURLToPath(new URL('./watchdog.mjs', import.meta.url))

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

export function documentAt(root: string, dir: string, documents: WorkspaceDocument[]): WorkspaceDocument | undefined {
  const rel = relative(real(root), real(dir)).split(sep).join('/')
  if (rel.startsWith('..')) return undefined
  return documents.find(doc => doc.dir === rel)
}

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
    this.ready.catch((error: unknown) => log.warn(`presmium-service: ${error instanceof Error ? error.message : String(error)}`))
  }

  #start(root: string): Promise<Endpoint> {
    const token = randomBytes(24).toString('base64url')
    const child = spawn(process.execPath, [WATCHDOG, process.execPath, presmiumBin(), 'serve', root, '--headless', '--port', '0'], {
      cwd: root,
      env: serviceEnv(token),
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

  documents(): Promise<WorkspaceDocument[]> {
    if (!this.#documents || Date.now() - this.#documents.at > DOCUMENTS_MS) {
      const list = this.#json<{ documents: WorkspaceDocument[] }>('/__presmium/presmium.workspace/documents').then(answer => answer.documents)
      this.#documents = { at: Date.now(), list }
      list.catch(() => this.#documents = undefined)
    }
    return this.#documents.list
  }

  directoryOf(agent: DshAgent): string {
    const dirs = this.#ctx.get('workingDirectory') as { get(session: unknown): string } | undefined
    try {
      return dirs?.get(agent.session) ?? agent.session.header?.cwd ?? process.cwd()
    } catch {
      return agent.session.header?.cwd ?? process.cwd()
    }
  }

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

  session(agent: DshAgent | undefined): PresmiumSession | undefined {
    return agent ? this.#open.get(agent.session.id) : undefined
  }

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
      this.#child.kill('SIGTERM')
      return
    }
    await this.request('/__presmium/presmium.server/tokens', { method: 'DELETE', body: {} }).then(r => r.body?.cancel(), () => undefined)
  }

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
