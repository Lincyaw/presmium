import { isRecord } from '@lincyaw/kernel'
import type { DocumentTranscriptionRequest, TranscriptionTask } from '@lincyaw/kernel'
import { WorkspaceServerError } from './workspace-client.ts'
import type { WorkspaceClient } from './workspace-client.ts'

export interface TranscriptionSessionState {
  request?: DocumentTranscriptionRequest
  task?: TranscriptionTask
  cancelled?: boolean
  sending: boolean
  cancelling: boolean
  checking: boolean
  verified: boolean
  failure?: string
  storageFailure: boolean
}
const active = (task?: TranscriptionTask) => Boolean(task && ['queued', 'running', 'cancelling'].includes(task.state))
const validIntent = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z\d_-]{16,128}$/.test(value)
const recoveredRequest = (value: unknown, documentId: string): value is DocumentTranscriptionRequest => isRecord(value) && isRecord(value.source)
  && value.source.documentId === documentId && typeof value.source.version === 'string' && /^[a-f\d]{20}$/.test(value.source.version)
  && typeof value.source.fingerprint === 'string' && /^[a-f\d]{16}$/.test(value.source.fingerprint) && validIntent(value.intent)
  && typeof value.assetId === 'string' && Boolean(value.assetId) && typeof value.engine === 'string' && Boolean(value.engine)
  && typeof value.audioSha256 === 'string' && /^[a-f\d]{64}$/.test(value.audioSha256) && value.confirmed === true
const sessions = new WeakMap<WorkspaceClient, Map<string, TranscriptionSession>>()

/** A task outlives its panel. Only explicit cancellation changes its remote lifetime. */
export class TranscriptionSession {
  readonly #client: WorkspaceClient
  readonly #directory: string
  readonly #documentId: string
  readonly #key: string
  readonly #listeners = new Set<() => void>()
  #state: TranscriptionSessionState = { sending: false, cancelling: false, checking: false, verified: false, storageFailure: false }
  #intent?: string
  #taskId?: string
  #read?: AbortController
  #timer?: ReturnType<typeof setTimeout>
  #closed = false

  constructor(client: WorkspaceClient, identity: string, directory: string, documentId: string) {
    this.#client = client; this.#directory = directory; this.#documentId = documentId
    this.#key = `presmium.transcription.v1:${JSON.stringify([identity, directory, documentId])}`
    try {
      const raw = localStorage.getItem(this.#key)
      if (raw) {
        const value: unknown = JSON.parse(raw)
        if (!isRecord(value) || value.documentId !== documentId || value.directory !== directory
          || value.request !== undefined && !recoveredRequest(value.request, documentId)
          || value.task !== undefined && (!isRecord(value.task) || !validIntent(value.task.intent) || typeof value.task.id !== 'string' || !/^[a-f\d]{64}$/.test(value.task.id))) throw new Error('transcription-recovery-invalid')
        this.#state = { ...this.#state, request: value.request as DocumentTranscriptionRequest | undefined, cancelled: value.cancelled === true }
        this.#intent = this.#state.request?.intent ?? (value.task as { intent: string } | undefined)?.intent
        this.#taskId = (value.task as { id: string } | undefined)?.id
      }
    } catch { this.#state = { ...this.#state, storageFailure: true }; try { localStorage.removeItem(this.#key) } catch { /* Storage remains unavailable. */ } }
  }

  getState = (): TranscriptionSessionState => this.#state
  get intent(): string | undefined { return this.#intent }
  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener)
    if (this.#listeners.size === 1) void this.refresh()
    return () => { this.#listeners.delete(listener); if (!this.#listeners.size) this.#stopRead() }
  }
  #set(patch: Partial<TranscriptionSessionState>, persist = false): void {
    if (this.#closed) return
    this.#state = { ...this.#state, ...patch }
    if (persist) {
      try {
        localStorage.setItem(this.#key, JSON.stringify({ documentId: this.#documentId, directory: this.#directory, request: this.#state.request, ...this.#taskId && this.#intent ? { task: { id: this.#taskId, intent: this.#intent } } : {}, cancelled: this.#state.cancelled }))
        this.#state.storageFailure = false
      } catch { this.#state.storageFailure = true }
    }
    for (const listener of this.#listeners) listener()
  }
  #stopRead(): void { clearTimeout(this.#timer); this.#timer = undefined; this.#read?.abort(); this.#read = undefined; if (this.#state.checking) this.#set({ checking: false }) }
  #accept(task: TranscriptionTask): void {
    if (task.intent !== this.#intent || task.document !== this.#directory || task.source.documentId !== this.#documentId || this.#state.cancelled && !this.#state.task) return
    const previous = this.#state.task
    if (previous?.id === task.id && task.sequence < previous.sequence) return
    this.#taskId = task.id
    this.#set({ task, request: undefined, sending: false, cancelled: false, verified: true, failure: undefined }, true)
  }
  select(task: TranscriptionTask): boolean {
    if (this.#closed || this.#state.sending || this.#state.cancelling || this.#state.request || active(this.#state.task)
      || task.document !== this.#directory || task.source.documentId !== this.#documentId) return false
    this.#stopRead(); this.#intent = task.intent; this.#taskId = task.id
    this.#set({ request: undefined, task, cancelled: false, verified: true, failure: undefined }, true)
    void this.refresh()
    return true
  }
  async start(request: DocumentTranscriptionRequest, start: () => Promise<TranscriptionTask>): Promise<void> {
    if (this.#closed || this.#state.sending || this.#state.cancelling || this.#state.request || this.#taskId && !this.#state.verified || active(this.#state.task)) throw new Error('transcription-busy')
    const sent = structuredClone(request)
    if (sent.source.documentId !== this.#documentId) throw new Error('document-identity-changed')
    this.#stopRead(); this.#intent = sent.intent; this.#taskId = undefined
    this.#set({ request: sent, task: undefined, cancelled: false, sending: true, verified: false, failure: undefined }, true)
    try { this.#accept(await start()) }
    catch (error) {
      if (this.#intent !== sent.intent || this.#state.cancelled) return
      const known = error instanceof WorkspaceServerError && (error.status < 500 || ['transcription-engine-unavailable', 'transcription-audio-unavailable', 'transcription-services-unavailable'].includes(error.message))
        || error instanceof Error && ['production-source-changed', 'document-identity-changed'].includes(error.message)
      if (known) this.#intent = undefined
      this.#set({ failure: error instanceof Error ? error.message : 'transcription-request-failed', ...known ? { request: undefined, sending: false } : {} }, true)
    } finally {
      if (this.#intent === sent.intent) { this.#set({ sending: false }); void this.refresh() }
    }
  }
  async refresh(): Promise<void> {
    if (this.#closed || !this.#intent || this.#state.cancelled || this.#read) return
    clearTimeout(this.#timer); this.#timer = undefined
    const intent = this.#intent, controller = new AbortController(); this.#read = controller
    this.#set({ checking: true })
    try {
      const task = await this.#client.readTranscription(this.#directory, this.#taskId ? { id: this.#taskId } : { intent }, controller.signal)
      if (!controller.signal.aborted && this.#intent === intent) this.#accept(task)
    } catch (error) {
      if (!controller.signal.aborted && this.#intent === intent) {
        if (error instanceof WorkspaceServerError && error.message === 'transcription-intent-cancelled') this.#set({ request: undefined, cancelled: true, verified: true, failure: undefined }, true)
        else if (!(error instanceof WorkspaceServerError && error.status === 404 && this.#state.request)) {
          if (error instanceof WorkspaceServerError && error.status === 404 && this.#taskId) { this.#taskId = undefined; this.#intent = undefined }
          this.#set({ failure: error instanceof Error ? error.message : 'transcription-request-failed' }, true)
        }
      }
    } finally {
      if (this.#read === controller) {
        this.#read = undefined
        this.#set({ checking: false })
        if (!this.#closed && this.#listeners.size && this.#intent === intent && (this.#state.request || active(this.#state.task))) this.#timer = setTimeout(() => void this.refresh(), 1000)
      }
    }
  }
  async cancel(): Promise<void> {
    if (this.#closed || !this.#intent || this.#state.cancelling || this.#state.cancelled) return
    const intent = this.#intent
    this.#set({ cancelling: true, failure: undefined })
    try {
      const answer = await this.#client.cancelTranscription(this.#directory, this.#taskId ? { id: this.#taskId } : { intent })
      if (this.#intent !== intent || answer.intent !== intent) return
      if (answer.task) this.#accept(answer.task)
      else if (answer.state === 'cancelled') this.#set({ request: undefined, task: undefined, sending: false, cancelled: true, verified: true, failure: undefined }, true)
    } catch (error) {
      if (this.#intent === intent) this.#set({ failure: error instanceof Error ? error.message : 'transcription-cancel-failed' })
    } finally { if (this.#intent === intent) { this.#set({ cancelling: false }); void this.refresh() } }
  }
  dispose(): void { this.#closed = true; this.#stopRead(); this.#listeners.clear() }
}

export function documentTranscriptionSession(client: WorkspaceClient, identity: string, directory: string, documentId: string): TranscriptionSession {
  let known = sessions.get(client)
  if (!known) sessions.set(client, known = new Map())
  const key = JSON.stringify([identity, directory, documentId])
  let session = known.get(key)
  if (!session) { session = new TranscriptionSession(client, identity, directory, documentId); known.set(key, session) }
  return session
}
export function disposeTranscriptionSessions(client: WorkspaceClient): void {
  for (const session of sessions.get(client)?.values() ?? []) session.dispose()
  sessions.delete(client)
}
