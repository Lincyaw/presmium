import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { connectPresmiumMcp } from '@lincyaw/mcp/client'
import { errorMessage, isRecord } from '@lincyaw/kernel'
import type { DiagnosticSnapshot, DocumentSummary } from '@lincyaw/kernel'
import { backgroundPriority, NODE_RESOURCE_ARGS, resourceEnvironment } from '@lincyaw/kernel/node'
import type { ListedTool, PresmiumMcpClient } from '@lincyaw/mcp/client'
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

export interface PresmiumSession {
  id: string
  document: DocumentSummary
  dir: string
  client: PresmiumMcpClient
  tools: ListedTool[]
  diagnostics: SessionDiagnostics
}

/** One current resource snapshot, shared by notifications and the next model step. */
class SessionDiagnostics {
  snapshot: DiagnosticSnapshot | undefined
  error: string | undefined
  readonly #client: PresmiumMcpClient
  readonly #uri: string
  #unsubscribe: (() => Promise<void>) | undefined
  #pending: Promise<void> | undefined
  #dirty = false
  #closed = false

  constructor(client: PresmiumMcpClient, document: string) {
    this.#client = client
    this.#uri = `presmium://diagnostics?document=${encodeURIComponent(document)}`
  }

  async start(): Promise<void> {
    this.#unsubscribe = await this.#client.subscribe(this.#uri, () => { void this.refresh() })
    await this.refresh()
  }

  refresh(): Promise<void> {
    if (this.#closed) return Promise.resolve()
    this.#dirty = true
    if (!this.#pending) {
      const pending = this.#read().finally(() => {
        this.#pending = undefined
        if (this.#dirty && !this.#closed) return this.refresh()
      })
      this.#pending = pending
    }
    return this.#pending
  }

  async #read(): Promise<void> {
    while (this.#dirty && !this.#closed) {
      this.#dirty = false
      try {
        const value = await this.#client.read(this.#uri)
        if (!isRecord(value) || typeof value.version !== 'number' || !Array.isArray(value.diagnostics)) throw new Error('the diagnostics resource returned an invalid snapshot')
        if (this.#closed) return
        this.snapshot = value as unknown as DiagnosticSnapshot
        this.error = undefined
      } catch (error) {
        if (!this.#closed) this.error = errorMessage(error)
      }
    }
  }

  async close(): Promise<void> {
    this.#closed = true
    this.#dirty = false
    await this.#unsubscribe?.()
  }
}

async function closeSession(session: PresmiumSession): Promise<void> {
  try {
    await session.diagnostics.close()
  } finally {
    await session.client.close()
  }
}

const START_MS = 180_000
const DOCUMENTS_MS = 2000
const WATCHDOG = fileURLToPath(new URL('./watchdog.mjs', import.meta.url))

function presmiumBin(): string {
  const entry = createRequire(import.meta.url).resolve('@lincyaw/cli')
  return join(dirname(dirname(entry)), 'bin', 'presmium.mjs')
}

function real(path: string): string {
  try {
    return realpathSync(path)
  } catch {
    return resolve(path)
  }
}

export function documentAt(root: string, dir: string, documents: DocumentSummary[]): DocumentSummary | undefined {
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
  #documents: { at: number, list: Promise<DocumentSummary[]> } | undefined
  readonly #opening = new Map<string, Promise<PresmiumSession | undefined>>()
  readonly #open = new Map<string, PresmiumSession>()
  readonly #failures = new Map<string, string>()
  readonly #refreshing = new Map<string, Promise<PresmiumSession | undefined>>()
  readonly #selectionVersions = new Map<string, number>()
  readonly #selectionListeners = new Map<string, { before(): Promise<void>, after(): Promise<void> }>()
  readonly #selected = new Map<string, string | null>()
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
    const child = spawn(process.execPath, [...NODE_RESOURCE_ARGS, WATCHDOG, process.execPath, ...NODE_RESOURCE_ARGS, presmiumBin(), 'serve', root, '--port', '0'], {
      cwd: root,
      env: resourceEnvironment(serviceEnv(token)),
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: true,
    })
    backgroundPriority(child.pid)
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

  documents(): Promise<DocumentSummary[]> {
    if (!this.#documents || Date.now() - this.#documents.at > DOCUMENTS_MS) {
      const list = this.#json<{ documents: DocumentSummary[] }>('/__presmium/presmium.workspace/documents').then(answer => answer.documents)
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
      const current = () => !this.#closed && this.#opening.get(id) === known
      known = this.#attach(agent, current).catch((error: unknown) => {
        if (!current()) return undefined
        const message = errorMessage(error)
        this.#log.warn(`presmium-service: the session ${id} has no Presmium tools: ${message}`)
        this.#failures.set(id, message)
        this.#opening.delete(id)
        return undefined
      })
      this.#opening.set(id, known)
    }
    return known
  }

  async #attach(agent: DshAgent, current: () => boolean): Promise<PresmiumSession | undefined> {
    const { root } = await this.ready
    const id = agent.session.id
    const documents = await this.documents()
    const selected = this.#selected.get(id)
    const document = selected === undefined ? documentAt(root, this.directoryOf(agent), documents) : documents.find(doc => doc.dir === selected)
    if (!current()) return undefined
    if (!document) {
      this.#failures.delete(id)
      return undefined
    }
    const grant = await this.#json<{ url: string, token: string }>('/__presmium/presmium.server/tokens', { body: { document: document.dir, session: id } })
    const client = await connectPresmiumMcp(grant.url, grant.token)
    const diagnostics = new SessionDiagnostics(client, document.dir)
    try {
      const session: PresmiumSession = { id, document, dir: resolve(root, document.dir), client, tools: await client.tools(), diagnostics }
      await diagnostics.start()
      if (current()) {
        this.#failures.delete(id)
        this.#open.set(id, session)
        return session
      }
    } catch (error) {
      await diagnostics.close().catch(() => undefined)
      await client.close().catch(() => undefined)
      throw error
    }
    await diagnostics.close().finally(() => client.close())
    return undefined
  }

  async selectDocument(id: string, document: string | null): Promise<void> {
    if (document !== null && !(await this.documents()).some(doc => doc.dir === document)) throw new Error('Unknown Presmium document')
    const version = (this.#selectionVersions.get(id) ?? 0) + 1
    this.#selectionVersions.set(id, version)
    const listener = this.#selectionListeners.get(id)
    await listener?.before()
    if (this.#selectionVersions.get(id) !== version) return
    this.#selected.set(id, document)
    await listener?.after()
  }

  watchSelection(id: string, listener: { before(): Promise<void>, after(): Promise<void> }): () => void {
    this.#selectionListeners.set(id, listener)
    return () => { if (this.#selectionListeners.get(id) === listener) this.#selectionListeners.delete(id) }
  }

  refresh(agent: DshAgent): Promise<PresmiumSession | undefined> {
    const id = agent.session.id
    let pending = this.#refreshing.get(id)
    if (!pending) {
      pending = this.#refresh(agent).finally(() => this.#refreshing.delete(id))
      this.#refreshing.set(id, pending)
    }
    return pending
  }

  async #refresh(agent: DshAgent): Promise<PresmiumSession | undefined> {
    const id = agent.session.id
    const selected = this.#selected.get(id)
    const current = await this.attach(agent)
    if (!current?.diagnostics.error && (selected === undefined || current?.document.dir === selected || (!current && selected === null))) return current
    await this.detach(id, false)
    return this.attach(agent)
  }

  session(agent: DshAgent | undefined): PresmiumSession | undefined {
    return agent ? this.#open.get(agent.session.id) : undefined
  }

  failure(agent: DshAgent): string | undefined {
    return this.#failures.get(agent.session.id)
  }

  async detach(id: string, forget = true): Promise<void> {
    if (forget) {
      this.#selectionVersions.delete(id)
      this.#selected.delete(id)
      this.#selectionListeners.delete(id)
    }
    const session = this.#open.get(id)
    const opening = this.#opening.get(id)
    this.#open.delete(id)
    this.#opening.delete(id)
    this.#failures.delete(id)
    if (session) await closeSession(session).catch(error => this.#log.warn(`presmium-service: closing session ${id}: ${errorMessage(error)}`))
    else await opening
    if (!session && !opening) return
    await this.request('/__presmium/presmium.server/tokens', { method: 'DELETE', body: { session: id } }).then(r => r.body?.cancel(), () => undefined)
  }

  async close(): Promise<void> {
    this.#closed = true
    for (const session of this.#open.values()) await closeSession(session).catch(error => this.#log.warn(`presmium-service: closing session ${session.id}: ${errorMessage(error)}`))
    this.#open.clear()
    await Promise.all(this.#opening.values())
    this.#opening.clear()
    this.#failures.clear()
    this.#selected.clear()
    this.#selectionVersions.clear()
    this.#selectionListeners.clear()
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
