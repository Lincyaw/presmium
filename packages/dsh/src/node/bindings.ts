import { realpathSync } from 'node:fs'
import { AsyncLocalStorage } from 'node:async_hooks'
import { relative, resolve, sep } from 'node:path'
import { isInside } from '@lincyaw/kernel/node'
import { connectPresmiumMcp } from '@lincyaw/mcp/client'
import { errorMessage, isRecord } from '@lincyaw/kernel'
import type { DiagnosticSnapshot, DocumentSummary } from '@lincyaw/kernel'
import type { ListedTool, PresmiumMcpClient, PreparedMcpCall } from '@lincyaw/mcp/client'
import type { DshAgent, DshContext, DshLogger } from './dsh-types.ts'
import { SERVER_ROUTES } from './server-routes.ts'
import type { WorkspaceServerClient } from './service.ts'
import { WorkspaceServerClient as CandidateServer } from './service.ts'
import { WORKSPACE_ROUTES } from './server-routes.ts'
import { deltaboxOf, runtimeAgent } from './deltabox-runtime.ts'

/** Fixed inputs owned by one pending invocation, including native resources that need retirement. */
export interface PreparedBindingCall { signature: string, arguments: Record<string, unknown>, native?: PreparedMcpCall }
/** The document an agent session works on: an MCP client with a session token for it, its tools and its diagnostics. */
export interface DocumentBinding {
  agentSessionId: string
  document: DocumentSummary
  dir: string
  client: PresmiumMcpClient
  authorClient: PresmiumMcpClient
  workspaceRoot: string
  readonly tools: ListedTool[]
  /** Complete metadata for the currently registered model surface; replaced only at tool installation. */
  registeredTools?: readonly ListedTool[]
  /** Ephemeral fixed inputs between pre-execute approval and this exact invocation. */
  preparedCalls?: Map<symbol, PreparedBindingCall>
  toolChanges: BindingTools
  diagnostics: BindingDiagnostics
}

interface SelectionListener {
  before(): Promise<void>
  after(): Promise<void>
}

/** Refreshes the tool list on MCP invalidations without replacing its document-bound client. */
export class BindingTools {
  snapshot: ListedTool[] = []
  error: string | undefined
  readonly #client: PresmiumMcpClient
  readonly #log: DshLogger
  readonly #listeners = new Set<() => void>()
  #signature = ''
  #unsubscribe: (() => Promise<void>) | undefined
  #pending: Promise<void> | undefined
  #dirty = false
  #closed = false

  constructor(client: PresmiumMcpClient, log: DshLogger) {
    this.#client = client
    this.#log = log
  }

  async start(): Promise<void> {
    this.#unsubscribe = await this.#client.subscribeTools(() => { void this.refresh() })
    await this.refresh()
    if (this.error) throw new Error(this.error)
  }

  watch(listener: () => void): () => void {
    this.#listeners.add(listener)
    return () => { this.#listeners.delete(listener) }
  }

  refresh(): Promise<void> {
    if (this.#closed) return Promise.resolve()
    this.#dirty = true
    if (!this.#pending) {
      this.#pending = this.#read().finally(() => {
        this.#pending = undefined
        if (this.#dirty && !this.#closed) return this.refresh()
      })
    }
    return this.#pending
  }

  async #read(): Promise<void> {
    while (this.#dirty && !this.#closed) {
      this.#dirty = false
      try {
        const tools = await this.#client.tools()
        if (this.#closed || this.#dirty) continue
        this.error = undefined
        const signature = JSON.stringify(tools)
        if (signature === this.#signature) continue
        this.#signature = signature
        this.snapshot = tools
        for (const listener of this.#listeners) listener()
      } catch (error) {
        if (!this.#closed) {
          this.error = errorMessage(error)
          this.#log.warn(`presmium-tools: the tool list did not refresh: ${this.error}`)
        }
      }
    }
  }

  async close(): Promise<void> {
    this.#closed = true
    this.#dirty = false
    this.#listeners.clear()
    await this.#unsubscribe?.()
  }
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
  const prepared = [...binding.preparedCalls?.values() ?? []]
  binding.preparedCalls?.clear()
  try {
    const results = await Promise.allSettled([...prepared.flatMap(value => value.native ? [value.native.close()] : []), binding.diagnostics.close(), binding.toolChanges.close()])
    const failed = results.find(result => result.status === 'rejected')
    if (failed?.status === 'rejected') throw failed.reason
  } finally {
    await Promise.all([binding.client.close(), binding.authorClient.close()])
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
  readonly #candidates = new Map<string, Promise<WorkspaceServerClient>>()
  readonly #parents = new Map<string, string>()
  readonly #candidateRoots = new Map<string, string>()
  readonly #candidateViews = new Map<string, string>()
  readonly #candidateVersions = new Map<string, string>()
  readonly #candidateOwners = new Map<string, Set<string>>()
  readonly #renewCandidates = new Set<string>()
  readonly #executions = new Map<string, Promise<unknown>>()
  readonly #execution = new AsyncLocalStorage<{ root: string, active: boolean }>()

  accessCandidate<T>(agent: DshAgent, operation: () => Promise<T>): Promise<T> {
    const owner = this.#execution.getStore()
    return owner?.active && owner.root === this.rootSessionOf(agent) ? operation() : this.serializeCandidate(agent, operation)
  }

  /** View renewal and tools share a boundary; a parent's running tool keeps its entry until it ends. */
  serializeCandidate<T>(agent: DshAgent, operation: () => Promise<T>): Promise<T> {
    const id = this.rootSessionOf(agent)
    const pending = (this.#executions.get(id) ?? Promise.resolve()).catch(() => undefined).then(() => {
      const owner = { root: id, active: true }
      return this.#execution.run(owner, async () => { try { return await operation() } finally { owner.active = false } })
    })
    this.#executions.set(id, pending)
    return pending.finally(() => { if (this.#executions.get(id) === pending) this.#executions.delete(id) })
  }

  rootSessionOf(agent: DshAgent): string {
    const header = agent.session.header as { origin?: string, parentSession?: string } | undefined
    if (header?.origin === 'subagent' && header.parentSession) this.#parents.set(agent.session.id, header.parentSession)
    let id = agent.session.id
    for (let depth = 0; depth < 32 && this.#parents.has(id); depth++) id = this.#parents.get(id)!
    return id
  }

  async candidateOf(agent: DshAgent): Promise<WorkspaceServerClient> {
    const id = this.rootSessionOf(agent)
    let owners = this.#candidateOwners.get(id)
    if (!owners) this.#candidateOwners.set(id, owners = new Set())
    owners.add(agent.session.id)
    let pending = this.#candidates.get(id)
    if (!pending) {
      pending = (async () => {
        const { root, version } = await this.#server.requestJson<{ root: string, version?: string }>(`${WORKSPACE_ROUTES}review/workspace`, { body: { session: id } })
        this.#candidateRoots.set(id, root)
        const runtime = deltaboxOf(this.#ctx)
        if (runtime && process.platform !== 'darwin' && !version) throw new Error('Presmium needs an updated workspace service with candidate version tracking; restart the workspace service before continuing this conversation')
        if (version) this.#candidateVersions.set(id, version)
        const previous = runtime?.candidateSession(runtimeAgent(agent))
        if (previous && previous.projectRoot !== root) await previous.close()
        let session = await runtime?.acquireFor(runtimeAgent(agent))
        let view: string
        try {
          if (session?.recoveredFrom && session.reviewActive) await session.reviewCommit()
          if (session && process.platform !== 'darwin') {
            // An adopted accepted view can predate a host restore. Preserve a pending native
            // review first, then start from the authoritative candidate before binding any tools.
            if (session.reviewActive) await session.reviewCommit()
            await runtime!.closeView(runtimeAgent(agent))
            session = await runtime!.acquireFor(runtimeAgent(agent))
          }
          view = session ? (await session.target()).mountpoint : root
        } finally {
          await runtime?.closeCandidate(runtimeAgent(agent))
        }
        if (session) await this.#server.requestJson(`${WORKSPACE_ROUTES}review/workspace`, { body: { session: id, resumed: true } })
        this.#candidateViews.set(id, view)
        const candidate = new CandidateServer({ root: view, candidate: true, presmium: this.#server.presmium }, this.#log)
        await candidate.ready
        return candidate
      })()
      this.#candidates.set(id, pending)
      void pending.catch(() => { if (this.#candidates.get(id) === pending) this.#candidates.delete(id) })
    }
    const candidate = await pending
    const directory = await candidate.ready
    const workingDirectory = this.#ctx.get('workingDirectory') as { set(agent: DshAgent, path: string): Promise<string> } | undefined
    if (!workingDirectory) throw new Error('Presmium needs the workingDirectory service for concurrent authoring')
    try {
      const logical = this.candidateDirectoryOf(agent) ?? directory.root
      if (!isInside(this.workingDirectoryOf(agent), logical)) await workingDirectory.set(agent, logical)
    } finally {
      await deltaboxOf(this.#ctx)?.closeCandidate(runtimeAgent(agent))
    }
    return candidate
  }

  candidateRootOf(agent: DshAgent | undefined): string | undefined {
    return agent ? this.#candidateRoots.get(this.rootSessionOf(agent)) : undefined
  }

  /** Learns the candidate's root of an agent whose project (`projectRoot`) is in the author's workspace. */
  async prepareCandidateRoot(agent: DshAgent, projectRoot: string): Promise<void> {
    if (this.candidateRootOf(agent)) return
    const { root } = await this.#server.ready
    if (!isInside(projectRoot, root)) return
    const id = this.rootSessionOf(agent)
    const candidate = await this.#server.requestJson<{ root: string }>(`${WORKSPACE_ROUTES}review/workspace`, { body: { session: id } })
    if (!this.#candidateRoots.has(id)) this.#candidateRoots.set(id, candidate.root)
  }

  candidateViewOf(agent: DshAgent | undefined): string | undefined {
    return agent ? this.#candidateViews.get(this.rootSessionOf(agent)) : undefined
  }

  candidateDirectoryOf(agent: DshAgent | undefined): string | undefined {
    const root = this.candidateRootOf(agent)
    const runtime = deltaboxOf(this.#ctx)
    return root && process.platform !== 'darwin' && runtime ? runtime.paths.pathFor(root) : root
  }

  async refreshCandidate(agent: DshAgent): Promise<void> {
    const { root } = await this.#server.ready
    if (!this.candidateRootOf(agent) && !isInside(this.workingDirectoryOf(agent), root)) return
    await this.candidateOf(agent)
    const id = this.rootSessionOf(agent)
    const runtime = deltaboxOf(this.#ctx)
    await runtime?.closeCandidate(runtimeAgent(agent))
    const { changed, version } = await this.#server.requestJson<{ changed: boolean, version?: string }>(`${WORKSPACE_ROUTES}review/workspace`, { body: { session: id, refresh: true } })
    const restored = version !== undefined && version !== this.#candidateVersions.get(id)
    if (version) this.#candidateVersions.set(id, version)
    // Through mode keeps the candidate service on the same real directory after refresh/publication.
    if (process.platform === 'darwin' && runtime) { this.#renewCandidates.delete(id); return }
    if (runtime && (changed || restored || this.#renewCandidates.has(id))) {
      await this.retireCandidate(agent)
      await this.candidateOf(agent)
    }
  }

  candidateChanged(agent: DshAgent): void { this.#renewCandidates.add(this.rootSessionOf(agent)) }

  /** Retire the private view only at a tool/step boundary, before its next binding is installed. */
  async retireCandidate(agent: DshAgent): Promise<void> {
    const id = this.rootSessionOf(agent)
    for (const owner of this.#candidateOwners.get(id) ?? [agent.session.id]) await this.unbind(owner, false)
    const candidate = this.#candidates.get(id)
    this.#candidates.delete(id)
    if (candidate) await (await candidate).close()
    this.#candidateViews.delete(id)
    const runtime = deltaboxOf(this.#ctx)
    await runtime?.closeCandidate(runtimeAgent(agent))
    await runtime?.closeView(runtimeAgent(agent))
    this.#renewCandidates.delete(id)
  }

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
    const cwd = this.workingDirectoryOf(agent)
    if (!this.candidateRootOf(agent) && !isInside(cwd, root)) return undefined
    const document = selected === undefined ? documentAt(root, agent.session.header?.cwd ?? root, documents) ?? (documents.length === 1 ? documents[0] : undefined) : documents.find(doc => doc.dir === selected)
    if (!current()) return undefined
    if (!document) {
      this.#failures.delete(id)
      return undefined
    }
    const candidate = await this.candidateOf(agent)
    const [grant, authorGrant] = await Promise.all([
      candidate.requestJson<{ url: string, token: string }>(`${SERVER_ROUTES}tokens`, { body: { document: document.dir, session: id } }),
      this.#server.requestJson<{ url: string, token: string }>(`${SERVER_ROUTES}tokens`, { body: { document: document.dir, session: id } }),
    ])
    const client = await connectPresmiumMcp(grant.url, grant.token)
    const authorClient = await connectPresmiumMcp(authorGrant.url, authorGrant.token)
    const diagnostics = new BindingDiagnostics(authorClient, document.dir)
    const toolChanges = new BindingTools(client, this.#log)
    try {
      const workspaceRoot = (await candidate.ready).root
      const binding: DocumentBinding = { agentSessionId: id, document, dir: resolve(workspaceRoot, document.dir), workspaceRoot, client, authorClient, get tools() { return toolChanges.snapshot }, toolChanges, diagnostics }
      await toolChanges.start()
      await diagnostics.start()
      if (current()) {
        this.#failures.delete(id)
        this.#bound.set(id, binding)
        return binding
      }
    } catch (error) {
      await Promise.all([diagnostics.close(), toolChanges.close()]).catch(() => undefined)
      await client.close().catch(() => undefined)
      await authorClient.close().catch(() => undefined)
      throw error
    }
    await Promise.all([diagnostics.close(), toolChanges.close()]).finally(() => Promise.all([client.close(), authorClient.close()]))
    return undefined
  }

  async selectDocument(agentSessionId: string, document: string | null): Promise<void> {
    const version = (this.#selectionVersions.get(agentSessionId) ?? 0) + 1
    this.#selectionVersions.set(agentSessionId, version)
    if (document !== null) {
      let documents = await this.#server.readDocuments()
      if (!documents.some(doc => doc.dir === document)) {
        this.#server.invalidateDocuments()
        documents = await this.#server.readDocuments()
      }
      if (this.#selectionVersions.get(agentSessionId) !== version) return
      if (!documents.some(doc => doc.dir === document)) throw new Error('Unknown Presmium document')
    }
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
    let ownerId = agentSessionId
    for (let depth = 0; depth < 32 && this.#parents.has(ownerId); depth++) ownerId = this.#parents.get(ownerId)!
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
    if (forget) {
      this.#parents.delete(agentSessionId)
      const owners = this.#candidateOwners.get(ownerId)
      owners?.delete(agentSessionId)
      if (owners?.size === 0) {
        const root = this.#candidateRoots.get(ownerId)
        this.#candidateOwners.delete(ownerId)
        this.#candidateRoots.delete(ownerId)
        this.#candidateViews.delete(ownerId)
        this.#candidateVersions.delete(ownerId)
        const candidate = this.#candidates.get(ownerId)
        this.#candidates.delete(ownerId)
        if (candidate) await (await candidate).close()
        if (root) await deltaboxOf(this.#ctx)?.retirePaths(root)
        await this.#server.requestJson(`${WORKSPACE_ROUTES}review/workspace`, { body: { session: ownerId, close: true } })
      }
    }
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
    await Promise.all([...this.#candidates.values()].map(async candidate => (await candidate).close()))
    this.#candidates.clear()
    this.#candidateRoots.clear()
    this.#candidateViews.clear()
    this.#candidateVersions.clear()
    this.#candidateOwners.clear()
    this.#parents.clear()
  }
}

