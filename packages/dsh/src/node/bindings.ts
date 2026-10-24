import { realpathSync } from 'node:fs'
import { relative, resolve, sep } from 'node:path'
import { connectPresmiumMcp } from '@lincyaw/mcp/client'
import { errorMessage, isRecord } from '@lincyaw/kernel'
import type { DiagnosticSnapshot, DocumentSummary } from '@lincyaw/kernel'
import type { ListedTool, PresmiumMcpClient } from '@lincyaw/mcp/client'
import type { DshAgent, DshContext, DshLogger } from './dsh-types.ts'
import { SERVER_ROUTES } from './server-routes.ts'
import type { WorkspaceServerClient } from './service.ts'

/** The document an agent session works on: an MCP client with a session token for it, its tools and its diagnostics. */
export interface DocumentBinding {
  agentSessionId: string
  document: DocumentSummary
  dir: string
  client: PresmiumMcpClient
  tools: ListedTool[]
  diagnostics: BindingDiagnostics
}

interface SelectionListener {
  before(): Promise<void>
  after(): Promise<void>
}

/** One current resource snapshot, shared by notifications and the next model step. */
export class BindingDiagnostics {
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

async function closeBinding(binding: DocumentBinding): Promise<void> {
  try {
    await binding.diagnostics.close()
  } finally {
    await binding.client.close()
  }
}

function realPath(path: string): string {
  try {
    return realpathSync(path)
  } catch {
    return resolve(path)
  }
}

function documentAt(root: string, dir: string, documents: DocumentSummary[]): DocumentSummary | undefined {
  const rel = relative(realPath(root), realPath(dir)).split(sep).join('/')
  if (rel.startsWith('..')) return undefined
  return documents.find(doc => doc.dir === rel)
}

/**
 * Binds each agent session to one document of the workspace: the one the workbench selected for it, or else the
 * document its working directory is in. Selecting no document (`null`) leaves the session unbound.
 */
export class DocumentBindings {
  readonly #ctx: DshContext
  readonly #server: WorkspaceServerClient
  readonly #log: DshLogger
  /** Each agent session's request to bind, kept once it is bound. */
  readonly #bindRequests = new Map<string, Promise<DocumentBinding | undefined>>()
  readonly #bound = new Map<string, DocumentBinding>()
  readonly #failures = new Map<string, string>()
  readonly #syncing = new Map<string, Promise<DocumentBinding | undefined>>()
  readonly #selectionVersions = new Map<string, number>()
  readonly #selectionListeners = new Map<string, SelectionListener>()
  readonly #selected = new Map<string, string | null>()
  #closed = false

  constructor(ctx: DshContext, server: WorkspaceServerClient, log: DshLogger) {
    this.#ctx = ctx
    this.#server = server
    this.#log = log
  }

  workingDirectoryOf(agent: DshAgent): string {
    const dirs = this.#ctx.get('workingDirectory') as { get(session: unknown): string } | undefined
    try {
      return dirs?.get(agent.session) ?? agent.session.header?.cwd ?? process.cwd()
    } catch {
      return agent.session.header?.cwd ?? process.cwd()
    }
  }

  bind(agent: DshAgent): Promise<DocumentBinding | undefined> {
    const id = agent.session.id
    let known = this.#bindRequests.get(id)
    if (!known) {
      const current = () => !this.#closed && this.#bindRequests.get(id) === known
      known = this.#bind(agent, current).catch((error: unknown) => {
        if (!current()) return undefined
        const message = errorMessage(error)
        this.#log.warn(`presmium-service: the session ${id} has no Presmium tools: ${message}`)
        this.#failures.set(id, message)
        this.#bindRequests.delete(id)
        return undefined
      })
      this.#bindRequests.set(id, known)
    }
    return known
  }

  async #bind(agent: DshAgent, current: () => boolean): Promise<DocumentBinding | undefined> {
    const { root } = await this.#server.ready
    const id = agent.session.id
    const documents = await this.#server.readDocuments()
    const selected = this.#selected.get(id)
    const document = selected === undefined ? documentAt(root, this.workingDirectoryOf(agent), documents) : documents.find(doc => doc.dir === selected)
    if (!current()) return undefined
    if (!document) {
      this.#failures.delete(id)
      return undefined
    }
    const grant = await this.#server.requestJson<{ url: string, token: string }>(`${SERVER_ROUTES}tokens`, { body: { document: document.dir, session: id } })
    const client = await connectPresmiumMcp(grant.url, grant.token)
    const diagnostics = new BindingDiagnostics(client, document.dir)
    try {
      const binding: DocumentBinding = { agentSessionId: id, document, dir: resolve(root, document.dir), client, tools: await client.tools(), diagnostics }
      await diagnostics.start()
      if (current()) {
        this.#failures.delete(id)
        this.#bound.set(id, binding)
        return binding
      }
    } catch (error) {
      await diagnostics.close().catch(() => undefined)
      await client.close().catch(() => undefined)
      throw error
    }
    await diagnostics.close().finally(() => client.close())
    return undefined
  }

  async selectDocument(agentSessionId: string, document: string | null): Promise<void> {
    if (document !== null && !(await this.#server.readDocuments()).some(doc => doc.dir === document)) throw new Error('Unknown Presmium document')
    const version = (this.#selectionVersions.get(agentSessionId) ?? 0) + 1
    this.#selectionVersions.set(agentSessionId, version)
    const listener = this.#selectionListeners.get(agentSessionId)
    await listener?.before()
    if (this.#selectionVersions.get(agentSessionId) !== version) return
    this.#selected.set(agentSessionId, document)
    await listener?.after()
  }

  watchSelection(agentSessionId: string, listener: SelectionListener): () => void {
    this.#selectionListeners.set(agentSessionId, listener)
    return () => { if (this.#selectionListeners.get(agentSessionId) === listener) this.#selectionListeners.delete(agentSessionId) }
  }

  /** Binds the session again when the selection changed or its diagnostics failed; concurrent calls share one. */
  syncBinding(agent: DshAgent): Promise<DocumentBinding | undefined> {
    const id = agent.session.id
    let pending = this.#syncing.get(id)
    if (!pending) {
      pending = this.#syncBinding(agent).finally(() => this.#syncing.delete(id))
      this.#syncing.set(id, pending)
    }
    return pending
  }

  async #syncBinding(agent: DshAgent): Promise<DocumentBinding | undefined> {
    const id = agent.session.id
    const selected = this.#selected.get(id)
    const current = await this.bind(agent)
    if (!current?.diagnostics.error && (selected === undefined || current?.document.dir === selected || (!current && selected === null))) return current
    await this.unbind(id, false)
    return this.bind(agent)
  }

  bindingOf(agent: DshAgent | undefined): DocumentBinding | undefined {
    return agent ? this.#bound.get(agent.session.id) : undefined
  }

  /** The document the session works on now, if it is bound to one. */
  documentOf(agentSessionId: string): string | undefined {
    return this.#bound.get(agentSessionId)?.document.dir
  }

  failureOf(agent: DshAgent): string | undefined {
    return this.#failures.get(agent.session.id)
  }

  /** Closes the session's binding and revokes its session token; `forget` drops its selection too. */
  async unbind(agentSessionId: string, forget = true): Promise<void> {
    if (forget) {
      this.#selectionVersions.delete(agentSessionId)
      this.#selected.delete(agentSessionId)
      this.#selectionListeners.delete(agentSessionId)
    }
    const binding = this.#bound.get(agentSessionId)
    const request = this.#bindRequests.get(agentSessionId)
    this.#bound.delete(agentSessionId)
    this.#bindRequests.delete(agentSessionId)
    this.#failures.delete(agentSessionId)
    if (binding) await closeBinding(binding).catch(error => this.#log.warn(`presmium-service: closing session ${agentSessionId}: ${errorMessage(error)}`))
    else await request
    if (!binding && !request) return
    await this.#server.request(`${SERVER_ROUTES}tokens`, { method: 'DELETE', body: { session: agentSessionId } }).then(r => r.body?.cancel(), () => undefined)
  }

  async close(): Promise<void> {
    this.#closed = true
    for (const binding of this.#bound.values()) await closeBinding(binding).catch(error => this.#log.warn(`presmium-service: closing session ${binding.agentSessionId}: ${errorMessage(error)}`))
    this.#bound.clear()
    await Promise.all(this.#bindRequests.values())
    this.#bindRequests.clear()
    this.#failures.clear()
    this.#selected.clear()
    this.#selectionVersions.clear()
    this.#selectionListeners.clear()
  }
}
