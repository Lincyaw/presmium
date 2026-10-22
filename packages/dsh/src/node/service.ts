import { randomBytes } from 'node:crypto'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { errorMessage } from '@lincyaw/kernel'
import type { DocumentSummary } from '@lincyaw/kernel'
import { DocumentBindings } from './bindings.ts'
import type { DshContext, DshLogger } from './dsh-types.ts'
import { launchWorkspaceServer } from './launch.ts'
import type { LaunchedProcess } from './launch.ts'
import { SERVER_ROUTES, WORKSPACE_ROUTES } from './server-routes.ts'

export const name = 'presmium-service'

export interface Config {
  url?: string
  token?: string
  root?: string
}

export interface Endpoint {
  url: string
  serviceToken: string
  root: string
}

/** What the row provides to the other rows as `ctx.presmium`. */
export interface Presmium {
  server: WorkspaceServerClient
  bindings: DocumentBindings
}

const DOCUMENTS_MS = 2000

/** The `presmium` command of the CLI this package depends on. */
function cliBin(): string {
  const entry = createRequire(import.meta.url).resolve('@lincyaw/cli')
  return join(dirname(dirname(entry)), 'bin', 'presmium.mjs')
}

/** The workspace server the bundle works with: the one the launcher gives (`url`, `token`), or one it launches itself. */
export class WorkspaceServerClient {
  readonly ready: Promise<Endpoint>
  readonly #launched: LaunchedProcess | undefined
  #documents: { at: number, list: Promise<DocumentSummary[]> } | undefined
  #closed = false

  constructor(config: Config, log: DshLogger) {
    const root = resolve(config.root || process.cwd())
    if (config.url) {
      this.ready = Promise.resolve({ url: config.url.replace(/\/+$/, ''), serviceToken: config.token ?? '', root })
    } else {
      const serviceToken = randomBytes(24).toString('base64url')
      const server = launchWorkspaceServer({
        presmium: cliBin(),
        dir: root,
        serviceToken,
        onOutput: (text) => {
          for (const line of text.split('\n').filter(Boolean)) log.debug(`presmium serve: ${line}`)
        },
      })
      this.#launched = server.process
      const { child } = server.process
      void server.process.exited.then(() => {
        if (!this.#closed) log.warn(`presmium serve exited (${child.signalCode ?? child.exitCode})`)
      })
      this.ready = server.ready.then(({ url, root }) => ({ url, serviceToken, root }))
    }
    this.ready.catch((error: unknown) => log.warn(`presmium-service: ${errorMessage(error)}`))
  }

  async request(path: string, init: { method?: string, body?: unknown, raw?: ArrayBuffer, headers?: Record<string, string>, signal?: AbortSignal } = {}): Promise<Response> {
    const { url, serviceToken } = await this.ready
    const json = init.body !== undefined
    return fetch(`${url}${path}`, {
      method: init.method ?? (json || init.raw ? 'POST' : 'GET'),
      headers: { ...json ? { 'Content-Type': 'application/json' } : {}, ...init.headers, ...serviceToken ? { Authorization: `Bearer ${serviceToken}` } : {} },
      ...json ? { body: JSON.stringify(init.body) } : init.raw ? { body: init.raw } : {},
      ...init.signal ? { signal: init.signal } : {},
    })
  }

  async requestJson<T>(path: string, init?: Parameters<WorkspaceServerClient['request']>[1]): Promise<T> {
    const response = await this.request(path, init)
    const text = await response.text()
    if (!response.ok) throw new Error(`${path} answered ${response.status}: ${text}`)
    return JSON.parse(text) as T
  }

  /** The workspace's documents, read at most every 2 s. */
  readDocuments(): Promise<DocumentSummary[]> {
    if (!this.#documents || Date.now() - this.#documents.at > DOCUMENTS_MS) {
      const list = this.requestJson<{ documents: DocumentSummary[] }>(`${WORKSPACE_ROUTES}documents`).then(answer => answer.documents)
      this.#documents = { at: Date.now(), list }
      list.catch(() => this.#documents = undefined)
    }
    return this.#documents.list
  }

  /** Stops the server it launched, or revokes the session tokens a given server issued to it. */
  async close(): Promise<void> {
    this.#closed = true
    if (this.#launched) {
      this.#launched.child.kill('SIGTERM')
      return
    }
    await this.request(`${SERVER_ROUTES}tokens`, { method: 'DELETE', body: {} }).then(r => r.body?.cancel(), () => undefined)
  }

  /** At the host's exit: stops the server it launched, synchronously. */
  stop(): void {
    this.#closed = true
    if (this.#launched?.child.exitCode === null) this.#launched.child.kill('SIGTERM')
  }
}

export function apply(ctx: DshContext, config: Config = {}): void {
  const log = ctx.logger?.('presmium') ?? console
  const server = new WorkspaceServerClient(config, log)
  const bindings = new DocumentBindings(ctx, server, log)
  ctx.provide('presmium', { server, bindings } satisfies Presmium)
  ctx.on('session/disposed', (session: { id: string }) => void bindings.unbind(session.id))
  const stop = () => server.stop()
  process.once('exit', stop)
  ctx.effect(() => () => {
    process.off('exit', stop)
    void bindings.close().then(() => server.close())
  })
}
