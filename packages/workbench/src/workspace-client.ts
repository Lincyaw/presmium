import type { ProjectOperation, ProjectPlan, ProjectPlanRequest, ProjectApply, ProjectApplied } from '@lincyaw/kernel'
import type { PreviewEventSubscription } from '@lincyaw/kernel'
import type { AuthoringDiagnostics } from '@lincyaw/kernel'
import type { CompileJob, DiagnosticSnapshot, DocumentOperation, DocumentsAnswer, ErrorAnswer, FocusAnswer, FocusReport, IrAnswer, IrEvent, JobSource, JobsAnswer, OperationAnswer, PreviewAnswer, PreviewDiagnostics, PreviewRenderer, RevertResult, ReviewEnd, ReviewSnapshot, ReviewUpdate, RevisionsAnswer, SavedAnswer, SourceAnswer, SourceTransactionAnswer, SourceTransactionChange, StartJobRequest, UncommittedFile, WorkbenchAnswer } from '@lincyaw/kernel'
import type { ApprovalRequest } from '@lincyaw/kernel'
import type { OperationBatch } from './telemetry.ts'
import type { VoiceCatalogAnswer, VoiceCloneStatus, VoiceoverCancellation, VoiceoverJob, VoiceoverJobsAnswer, VoiceoverRequest, VoiceoverSnapshot, VoicePreviewAnswer, VoicePreviewQuery, VoicePreviewQuote, VoicePreviewRequest } from '@lincyaw/kernel'
import type { PageDeleteAnswer, PageDeletePlan, PageDeleteRequest } from '@lincyaw/kernel'
import type { DocumentAnswer, DocumentChange, DocumentChangeAnswer, DocumentEvent } from '@lincyaw/kernel'
import type { AppliedDocumentAuthoringAction, AuthoringCapabilities, DocumentAuthoringActionInspection, DocumentAuthoringActionPlan, DocumentAuthoringActionRead, DocumentAuthoringActionReference, DocumentAuthoringActionRequest } from '@lincyaw/kernel'
import type { DocumentRecordingAdoption, VerifiedDocumentRecordingAdoption, DocumentAudioImport, DocumentAudioImportAnswer, DocumentAudioInspectionAnswer, DocumentMediaClipChange } from '@lincyaw/kernel'
import type { DocumentImageImport, DocumentImageImportAnswer } from '@lincyaw/kernel'
import type { ProductionAssetAnswer, ProductionAssetQuery, ProductionMediaQuery, ProductionPlan, ProductionPlanQuery } from '@lincyaw/kernel'
import type { DocumentTranscriptionRequest, TranscriptionCapabilities, TranscriptionTask, TranscriptionListAnswer, TranscriptionRevision, TranscriptionCancellation, TranscriptionAdoptionDraft, TranscriptionAdoptionPlan, TranscriptionAdoptionApply, TranscriptionAdoptionAnswer } from '@lincyaw/kernel'

/** A change of the host's pending approvals that this author may answer. */
export type ApprovalEvent =
  | { type: 'approval', id: string, request: ApprovalRequest }
  | { type: 'settled', id: string }
  /** The connection (re)opened: the pending approvals follow, so earlier ones are no longer known. */
  | { type: 'reset' }

const observedFailures = new WeakSet<object>()
// A 503 with Retry-After is work still in progress (a preview being prepared), not a failure of the service.
const isRetryLater = (response: Response) => response.status === 503 && response.headers.has('Retry-After')
/** Whether the owned request observer already received this transport failure. */
export const isObservedWorkspaceFailure = (error: unknown): boolean => typeof error === 'object' && error !== null && observedFailures.has(error)

/** A route of the workspace server answered with an error. */
/** A cloned voice to train: the sample and the consent statement are WAV recordings of the same speaker. */
export interface VoiceCloneForm { engine?: string, voice: string, lang?: string, speaker: string, scope: string, sample: Blob, statement: Blob }

export class WorkspaceServerError extends Error {
  readonly status: number
  readonly answer: ErrorAnswer
  constructor(status: number, answer: ErrorAnswer) {
    super(answer.error ?? answer.detail ?? answer.title ?? `HTTP ${status}`)
    this.status = status
    this.answer = answer
  }
}

/** Only transport metadata is observed; request content, headers and query values remain private. */
export interface WorkspaceRequestEvent {
  kind: 'start' | 'failure' | 'recovery' | 'cancel'
  requestId: number
  path: string
  method: string
  document?: string
  status?: number
  /** The caller renders HTTP failures locally; transport failures remain global. */
  feedbackOwner?: 'inline-preview'
}

/** The workbench's client of the workspace server's routes; each `subscribe*` returns its unsubscribe. */
export interface WorkspaceCapabilities {
  /** Omitted capabilities retain the local workspace's complete behavior. */
  diagnostics?: 'none' | 'full'
  production?: boolean
  narration?: boolean
  export?: boolean
  readOnly?: boolean
}

export interface WorkspaceClient {
  capabilities?: Readonly<WorkspaceCapabilities>
  subscribePreviewEvents?: PreviewEventSubscription
  openAuthoringClient?: AuthoringClientSubscription
  subscribeRequests?(listener: (event: WorkspaceRequestEvent) => void): () => void
  readDocuments(document?: string): Promise<DocumentsAnswer>
  planProjectChange(request: ProjectPlanRequest): Promise<ProjectPlan>
  operateDocument(operation: ProjectOperation, planned?: ProjectPlan): Promise<OperationAnswer>
  readSource(document: string, path: string): Promise<SourceAnswer>
  /** Saves the file; in a git workspace the save is committed at once, `message` its summary. */
  saveSource(document: string, path: string, content: string, base: string, message?: string): Promise<SavedAnswer>
  /** Saves a small set of files in one document with one version and rollback boundary. */
  saveSourceTransaction(document: string, changes: SourceTransactionChange[], message?: string): Promise<SourceTransactionAnswer>
  readIr(document: string): Promise<IrAnswer>
  readDocument(document: string): Promise<DocumentAnswer>
  readAuthoringCapabilities(document: string, signal?: AbortSignal): Promise<AuthoringCapabilities>
  planDocumentAction(document: string, request: DocumentAuthoringActionRequest, signal?: AbortSignal): Promise<DocumentAuthoringActionPlan>
  readDocumentActionPlan(document: string, reference: DocumentAuthoringActionRead, signal?: AbortSignal): Promise<DocumentAuthoringActionInspection>
  applyDocumentAction(document: string, reference: DocumentAuthoringActionReference, signal?: AbortSignal): Promise<AppliedDocumentAuthoringAction>
  /** A same-origin display URL; the canonical asset location remains untouched. */
  documentAssetURL(document: string, assetId: string): string
  changeDocument(document: string, change: DocumentChange): Promise<DocumentChangeAnswer>
  importDocumentImage(document: string, file: File, change: DocumentImageImport, signal?: AbortSignal): Promise<DocumentImageImportAnswer>
  readDocumentAudio(document: string, assetId: string, baseDocumentVersion: string, signal?: AbortSignal): Promise<DocumentAudioInspectionAnswer>
  importDocumentAudio(document: string, file: File, change: DocumentAudioImport, signal?: AbortSignal): Promise<DocumentAudioImportAnswer>
  adoptRecording(document: string, request: DocumentRecordingAdoption, signal?: AbortSignal): Promise<VerifiedDocumentRecordingAdoption>
  changeDocumentMediaClip(document: string, change: DocumentMediaClipChange, signal?: AbortSignal): Promise<DocumentChangeAnswer>
  readTranscriptionCapabilities(document: string, signal?: AbortSignal): Promise<TranscriptionCapabilities>
  readTranscriptions(document: string, signal?: AbortSignal): Promise<TranscriptionListAnswer>
  startTranscription(document: string, request: DocumentTranscriptionRequest, signal?: AbortSignal): Promise<TranscriptionTask>
  readTranscription(document: string, query: { id: string } | { intent: string }, signal?: AbortSignal): Promise<TranscriptionTask>
  readTranscriptionResult(document: string, id: string, revision: string, signal?: AbortSignal): Promise<TranscriptionRevision>
  cancelTranscription(document: string, query: { id: string } | { intent: string }, signal?: AbortSignal): Promise<TranscriptionCancellation>
  planTranscriptionAdoption(document: string, draft: TranscriptionAdoptionDraft, signal?: AbortSignal): Promise<TranscriptionAdoptionPlan>
  applyTranscriptionAdoption(document: string, request: TranscriptionAdoptionApply, signal?: AbortSignal): Promise<TranscriptionAdoptionAnswer>
  subscribeDocument(document: string, changed: (event: DocumentEvent) => void, failed?: () => void): () => void
  readPageDeletion(document: string, section: string): Promise<PageDeletePlan>
  deletePage(document: string, request: PageDeleteRequest): Promise<PageDeleteAnswer>
  readVoiceCatalog(document: string, engine?: string, lang?: string, signal?: AbortSignal): Promise<VoiceCatalogAnswer>
  /** Registers the speaker's consent and starts training a cloned voice: the owner's, and paid for at the provider. */
  cloneVoice(document: string, request: VoiceCloneForm, signal?: AbortSignal): Promise<VoiceCloneStatus>
  readCloneStatus(document: string, voice: string, engine?: string, signal?: AbortSignal): Promise<VoiceCloneStatus>
  readVoiceover(document: string, signal?: AbortSignal): Promise<VoiceoverSnapshot>
  readVoiceoverJobs(document: string, signal?: AbortSignal): Promise<VoiceoverJobsAnswer>
  readProductionPlan(document: string, query: ProductionPlanQuery, signal?: AbortSignal): Promise<ProductionPlan>
  readProductionAsset(document: string, query: ProductionAssetQuery, signal?: AbortSignal): Promise<ProductionAssetAnswer>
  readProductionMedia(document: string, query: ProductionMediaQuery, signal?: AbortSignal): Promise<Blob>
  /** Allocates an intent before sending; aborted or undelivered requests cancel by intent even without a job id. */
  startVoiceover(document: string, request: Omit<VoiceoverRequest, 'intent'> & { intent?: string }, signal?: AbortSignal): Promise<VoiceoverJob>
  cancelVoiceover(document: string, id: string, signal?: AbortSignal): Promise<VoiceoverJob>
  cancelVoiceoverIntent(document: string, intent: string, signal?: AbortSignal): Promise<VoiceoverCancellation>
  previewVoice(document: string, request: VoicePreviewRequest, signal?: AbortSignal): Promise<VoicePreviewAnswer>
  readVoicePreview(document: string, query: VoicePreviewQuery, signal?: AbortSignal): Promise<VoicePreviewQuote>
  subscribeIr(document: string, revision: (event: IrEvent) => void, failed?: () => void): () => void
  readDiagnostics(document: string): Promise<DiagnosticSnapshot>
  subscribeDiagnostics(document: string, snapshot: (event: DiagnosticSnapshot) => void, failed: () => void): () => void
  reportDiagnostics(report: PreviewDiagnostics): Promise<unknown>
  reportAuthoringDiagnostics(report: AuthoringDiagnostics): Promise<unknown>
  readPreview(document: string, renderer?: PreviewRenderer, signal?: AbortSignal, feedbackOwner?: WorkspaceRequestEvent['feedbackOwner']): Promise<PreviewAnswer>
  /** Asks the service to prepare a form of the document ahead of the author, when the machine has room. */
  prefetchPreview(document: string, renderer: PreviewRenderer): Promise<PreviewAnswer>
  /** The MCP address and the workspace root, read once. */
  readWorkbenchInfo(): Promise<WorkbenchAnswer>
  readFocus(document: string): Promise<FocusAnswer>
  writeFocus(document: string, focus: FocusReport[]): Promise<FocusAnswer>
  subscribeReview(document: string, update: (event: ReviewUpdate) => void): () => void
  acceptReview(document: string, body: { reject?: string[], message?: string }): Promise<{ ended: ReviewEnd }>
  rejectReview(document: string, paths?: string[]): Promise<ReviewUpdate>
  restoreReview(document: string, step: string): Promise<{ review: ReviewSnapshot }>
  readChanges(document: string): Promise<{ files: UncommittedFile[] }>
  commitChanges(document: string, message: string, paths?: string[]): Promise<unknown>
  discardChanges(document: string, paths?: string[]): Promise<unknown>
  readRevisions(document: string, query?: import('@lincyaw/kernel').DocumentHistoryQuery): Promise<RevisionsAnswer>
  readHistoryFile(document: string, query: import('@lincyaw/kernel').DocumentHistoryRead): Promise<import('@lincyaw/kernel').DocumentHistoryFile>
  revertRevision(document: string, request: import('@lincyaw/kernel').DocumentHistoryChange): Promise<import('@lincyaw/kernel').DocumentHistoryChanged>
  /** Takes back the document's latest change; `expect` is the `undo` of the history read, refused when it is not the latest any more. */
  undo(document: string, request: import('@lincyaw/kernel').DocumentHistoryChange): Promise<import('@lincyaw/kernel').DocumentHistoryChanged>
  /** Puts back the change the latest undo took back. */
  redo(document: string, request: import('@lincyaw/kernel').DocumentHistoryChange): Promise<import('@lincyaw/kernel').DocumentHistoryChanged>
  /** What the document can be made into, and its builds and exports. */
  readJobs(document: string): Promise<JobsAnswer>
  /** Starts a build or an export of the document (or answers the one already made from this revision). */
  startJob(document: string, target: string, source: JobSource): Promise<CompileJob>
  cancelJob(document: string, id: string): Promise<CompileJob>
  /** Each change of the document's jobs, as it happens. */
  subscribeJobs(document: string, changed: (job: CompileJob) => void, failed?: () => void, ready?: () => void): () => void
  /** The host's approvals of agent operations; the workbench hears them without being a viewer window. */
  subscribeApprovals(changed: (event: ApprovalEvent) => void, failed?: () => void): () => void
  /** Answers one approval; a 404 means it already ended (answered elsewhere or timed out). */
  answerApproval(id: string, allow: boolean): Promise<void>
  /** Whether the host collects the workbench's operations for its operator. */
  readTelemetry(): Promise<{ enabled: boolean }>
  /** Sends a batch of operations; `beacon` hands it to the browser to deliver while the page goes away. */
  sendTelemetry(batch: OperationBatch, beacon?: boolean): Promise<void>
}

/** A host may carry these event subscriptions over its authenticated shared connection. */
export interface AuthoringClientChannel {
  publish(connectionId: string, report: import('@lincyaw/kernel').AuthoringClientReport): Promise<void>
  acknowledge(connectionId: string, report: import('@lincyaw/kernel').AuthoringClientAcknowledgement): Promise<void>
  close(): void
}
export type AuthoringClientSubscription = (document: string, open: import('@lincyaw/kernel').AuthoringClientOpen, received: (event: import('@lincyaw/kernel').AuthoringClientEvent) => void, failed: () => void) => AuthoringClientChannel
export interface WorkspaceSubscription {
  (address: string, event: string, received: (data: string, event?: string) => void, failed?: () => void, ready?: () => void): () => void
  openAuthoringClient?: AuthoringClientSubscription
}

/** A remote host may add its CSRF header without replacing the page's global fetch. */
export interface WorkspaceTransport { fetch?: typeof globalThis.fetch }

export function workspaceClient(base = 'api/presmium/', subscription?: WorkspaceSubscription, transport: WorkspaceTransport = {}): WorkspaceClient {
  let client: WorkspaceClient
  const fetch = transport.fetch ?? globalThis.fetch.bind(globalThis)
  const requestListeners = new Set<(event: WorkspaceRequestEvent) => void>()
  let requestSequence = 0
  const observedFetch = async (address: string, init?: RequestInit, feedbackOwner?: WorkspaceRequestEvent['feedbackOwner']): Promise<Response> => {
    const target = new URL(address)
    const prefix = new URL(base, globalThis.document.baseURI).pathname
    const path = target.pathname.slice(prefix.length)
    const method = (init?.method ?? 'GET').toUpperCase()
    if (client.capabilities?.readOnly && !['GET', 'HEAD', 'OPTIONS'].includes(method)
      && /^(?:document(?:\/|$)|source(?:\/|$)|project\/|pages\/|history\/|revisions\/|review(?:\/|$))/.test(path)) throw new WorkspaceServerError(403, { error: 'permission-denied' })
    if (path === 'telemetry' || (path === 'diagnostics' || path === 'diagnostics/authoring') && method === 'POST') return fetch(address, { credentials: 'same-origin', ...init })
    const document = target.searchParams.get('document') ?? undefined
    const requestId = ++requestSequence
    const emit = (kind: WorkspaceRequestEvent['kind'], status?: number) => {
      const event: WorkspaceRequestEvent = { kind, requestId, path, method, ...document !== undefined ? { document } : {}, ...status !== undefined ? { status } : {}, ...feedbackOwner ? { feedbackOwner } : {} }
      for (const listener of requestListeners) {
        const notify = () => {
          if (!requestListeners.has(listener)) return
          // Observers must not alter the request's return value or cancellation.
          try { listener(event) } catch (error) { queueMicrotask(() => { throw error }) }
        }
        // Workspace-scoped source requests need the active document at invocation.
        if (kind === 'start') notify()
        else queueMicrotask(notify)
      }
    }
    emit('start')
    try {
      const response = await fetch(address, { credentials: 'same-origin', ...init })
      if (response.status >= 500 && !isRetryLater(response)) emit('failure', response.status)
      else emit('recovery', response.status)
      return response
    } catch (error) {
      const timedOut = error instanceof Error && error.name === 'TimeoutError' || init?.signal?.reason instanceof Error && init.signal.reason.name === 'TimeoutError'
      const cancelled = !timedOut && (init?.signal?.aborted || error instanceof Error && error.name === 'AbortError')
      if (!cancelled) {
        if (typeof error === 'object' && error !== null) observedFailures.add(error)
        emit('failure')
      } else emit('cancel')
      throw error
    }
  }
  const irCacheLimit = 16 << 20
  type CachedIR = { etag: string, answer: IrAnswer, bytes: number }
  const irCache = new Map<string, CachedIR>()
  const irPending = new Map<string, Promise<IrAnswer>>()
  let irBytes = 0
  let workbenchInfo: Promise<WorkbenchAnswer> | undefined
  const url = (path: string, document?: string, query: Record<string, string> = {}) => {
    const address = new URL(`${base}${path}`, globalThis.document.baseURI)
    if (document !== undefined) address.searchParams.set('document', document)
    for (const [name, value] of Object.entries(query)) address.searchParams.set(name, value)
    return address.href
  }
  const call = async <T>(address: string, init?: RequestInit, feedbackOwner?: WorkspaceRequestEvent['feedbackOwner']): Promise<T> => {
    const response = await observedFetch(address, init, feedbackOwner)
    const data = await response.json().catch(() => ({})) as T & ErrorAnswer
    if (!response.ok) {
      const error = new WorkspaceServerError(response.status, data)
      if (response.status >= 500 && !isRetryLater(response)) observedFailures.add(error)
      throw error
    }
    return data
  }
  const post = <T>(address: string, body: unknown, signal?: AbortSignal) => call<T>(address, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal })
  const startVoiceover: WorkspaceClient['startVoiceover'] = async (document, request, signal) => {
    signal?.throwIfAborted()
    const intent = request.intent ?? Array.from(crypto.getRandomValues(new Uint32Array(4)), value => value.toString(16).padStart(8, '0')).join('')
    let cancellation: Promise<VoiceoverCancellation> | undefined
    const cancel = () => cancellation ??= post<VoiceoverCancellation>(url('voiceover/cancel', document), { intent }, AbortSignal.timeout(5000))
    const aborted = () => { void cancel().catch(() => {}) }
    signal?.addEventListener('abort', aborted, { once: true })
    try {
      const job = await post<VoiceoverJob>(url('voiceover', document), { ...request, intent }, signal)
      signal?.throwIfAborted()
      if (job.intent !== intent) throw new Error('voice-intent-changed')
      return job
    } catch (error) {
      // The server may have admitted a job before the response was lost.
      // Cancellation uses a fresh signal; the owned observer reports transport failures.
      if (signal?.aborted || !(error instanceof WorkspaceServerError) || error.status >= 500) await cancel().catch(() => {})
      throw error
    } finally { signal?.removeEventListener('abort', aborted) }
  }
  const rememberIR = (document: string, value?: CachedIR) => {
    const old = irCache.get(document)
    if (old) irBytes -= old.bytes
    irCache.delete(document)
    if (value) {
      irCache.set(document, value)
      irBytes += value.bytes
    }
    while (irCache.size > 2 || irBytes > irCacheLimit) {
      const first = irCache.keys().next().value!
      irBytes -= irCache.get(first)!.bytes
      irCache.delete(first)
    }
  }
  const fetchIR = async (document: string): Promise<IrAnswer> => {
    const known = irCache.get(document)
    const response = await observedFetch(url('ir', document), {
      credentials: 'same-origin',
      cache: 'no-store',
      ...known ? { headers: { 'If-None-Match': known.etag } } : {},
    })
    if (response.status === 304 && known) {
      rememberIR(document, known)
      return known.answer
    }
    const text = await response.text().catch(() => '')
    let data: IrAnswer & ErrorAnswer
    try {
      data = JSON.parse(text) as IrAnswer & ErrorAnswer
    } catch {
      data = {} as IrAnswer & ErrorAnswer
    }
    if (!response.ok) {
      const error = new WorkspaceServerError(response.status, data)
      if (response.status >= 500) observedFailures.add(error)
      throw error
    }
    const etag = response.headers.get('ETag')
    // Account for UTF-16 response text; the parsed object's heap size is a soft limit.
    const bytes = text.length * 2
    rememberIR(document, response.status === 200 && etag && bytes <= irCacheLimit ? { etag, answer: data, bytes } : undefined)
    return data
  }
  const readIr = (document: string): Promise<IrAnswer> => {
    const pending = irPending.get(document)
    if (pending) return pending
    const request = fetchIR(document).finally(() => {
      if (irPending.get(document) === request) irPending.delete(document)
    })
    irPending.set(document, request)
    return request
  }
  const subscribe = <T>(address: string, name: string, on: (data: T) => void, failed?: () => void, ready?: () => void) => {
    const received = (data: string) => {
      try { on(JSON.parse(data) as T) } catch { failed?.() }
    }
    if (subscription) return subscription(address, name, received, failed, ready)
    const source = new EventSource(address)
    source.addEventListener(name, event => received((event as MessageEvent<string>).data))
    if (failed) source.addEventListener('error', failed)
    if (ready) source.addEventListener('open', ready)
    return () => source.close()
  }
  const projectIntents = new Map<string, { id: string, plan?: ProjectPlan }>()
  return client = {
    ...subscription?.openAuthoringClient ? { openAuthoringClient: subscription.openAuthoringClient } : {},
    ...subscription ? { subscribePreviewEvents: ((target, received) => {
      const address = new URL(base, globalThis.document.baseURI)
      for (const [key, value] of Object.entries(target)) if (key !== 'topic') address.searchParams.set(key, value)
      return subscription(address.href, target.topic, (data, event) => received({ type: 'event', event: event ?? '', data }), () => received({ type: 'error' }), () => received({ type: 'open' }))
    }) satisfies PreviewEventSubscription } : {},
    subscribeRequests: listener => { requestListeners.add(listener); return () => { requestListeners.delete(listener) } },
    readDocuments: document => call(url('documents', document)),
    planProjectChange: request => post(url('project/plan'), request),
    async operateDocument(operation, planned) {
      if (operation.op === 'delete' && (!planned || JSON.stringify(planned.operation) !== JSON.stringify(operation))) throw new Error('project-deletion-plan-required')
      const key = JSON.stringify(operation)
      let intent = projectIntents.get(key)
      if (!intent) { intent = { id: crypto.randomUUID() }; projectIntents.set(key, intent) }
      while (projectIntents.size > 64) projectIntents.delete(projectIntents.keys().next().value!)
      try {
        intent.plan ??= planned
        intent.plan ??= await post<ProjectPlan>(url('project/plan'), { id: intent.id, operation })
        const answer = await post<OperationAnswer>(url('project/apply'), { planId: intent.plan.planId, digest: intent.plan.digest, ...operation.op === 'delete' ? { confirmDeletion: true } : {} })
        projectIntents.delete(key)
        return answer
      } catch (error) {
        if (error instanceof WorkspaceServerError && error.status < 500) projectIntents.delete(key)
        throw error
      }
    },
    readSource: (document, path) => call(url('source', document, { path })),
    saveSource: (document, path, content, base, message) => post(url('source', document), { path, content, base, ...message ? { message } : {} }),
    saveSourceTransaction: (document, changes, message) => post(url('source/transaction', document), { changes, ...message ? { message } : {} }),
    readIr,
    readDocument: document => call(url('document', document)),
    readAuthoringCapabilities: (document, signal) => call(url('document/capabilities', document), { signal }),
    planDocumentAction: (document, request, signal) => post(url('document/action/plan', document), request, signal),
    readDocumentActionPlan: (document, reference, signal) => call(url('document/action/plan', document, { planId: reference.planId, digest: reference.digest }), { signal }),
    applyDocumentAction: (document, reference, signal) => post(url('document/action/apply', document), reference, signal),
    documentAssetURL: (document, asset) => url('document/asset', document, { asset }),
    changeDocument: (document, change) => post(url('document/change', document), change),
    importDocumentImage: (document, file, change, signal) => {
      const body = new FormData()
      body.set('change', JSON.stringify(change)); body.set('file', file)
      return call(url('document/image', document), { method: 'POST', body, signal })
    },
    readDocumentAudio: (document, assetId, baseDocumentVersion, signal) => call(url('document/audio', document, { assetId, baseDocumentVersion }), { signal }),
    importDocumentAudio: (document, file, change, signal) => {
      const body = new FormData()
      body.set('change', JSON.stringify(change)); body.set('file', file)
      return call(url('document/audio', document), { method: 'POST', body, signal })
    },
    adoptRecording: (document, request, signal) => post(url('document/recording/adopt', document), request, signal),
    changeDocumentMediaClip: (document, change, signal) => post(url('document/media-clip', document), change, signal),
    readTranscriptionCapabilities: (document, signal) => call(url('document/transcription/capabilities', document), { signal }),
    readTranscriptions: (document, signal) => call(url('document/transcription', document), { signal }),
    startTranscription: (document, request, signal) => post(url('document/transcription', document), request, signal),
    readTranscription: (document, query, signal) => call(url('document/transcription', document, query), { signal }),
    readTranscriptionResult: (document, id, revision, signal) => call(url('document/transcription/result', document, { id, revision }), { signal }),
    cancelTranscription: (document, query, signal) => post(url('document/transcription/cancel', document), query, signal),
    planTranscriptionAdoption: (document, draft, signal) => post(url('document/transcription/adoption/plan', document), draft, signal),
    applyTranscriptionAdoption: (document, request, signal) => post(url('document/transcription/adoption/apply', document), request, signal),
    subscribeDocument: (document, changed, failed) => subscribe(url('document/events', document), 'document', changed, failed),
    readPageDeletion: (document, section) => call(url('pages/delete', document, { section })),
    deletePage: (document, request) => post(url('pages/delete', document), request),
    readVoiceCatalog: (document, engine, lang, signal) => call(url('voice-catalog', document, { ...engine ? { engine } : {}, ...lang ? { lang } : {} }), { signal }),
    cloneVoice: (document, request, signal) => {
      const body = new FormData()
      for (const [name, value] of [['engine', request.engine], ['voice', request.voice], ['lang', request.lang], ['speaker', request.speaker], ['scope', request.scope]] as const) if (value) body.set(name, value)
      body.set('confirmed', '1')
      body.set('sample', request.sample, 'sample.wav')
      body.set('statement', request.statement, 'statement.wav')
      return call(url('voice-clone', document), { method: 'POST', body, signal })
    },
    readCloneStatus: (document, voice, engine, signal) => call(url('voice-clone/status', document, { voice, ...engine ? { engine } : {} }), { signal }),
    readVoiceover: (document, signal) => call(url('voiceover', document), { signal }),
    readVoiceoverJobs: (document, signal) => call(url('voiceover/jobs', document), { signal }),
    readProductionPlan: (document, query, signal) => call(url('production-plan', document, { source: JSON.stringify(query.source), irRevision: query.irRevision }), { signal }),
    readProductionAsset: (document, query, signal) => call(url('production-asset', document, { source: JSON.stringify(query.source), irRevision: query.irRevision, assetId: query.assetId }), { signal }),
    async readProductionMedia(document, query, signal) {
      const response = await observedFetch(url('production-media', document, { source: JSON.stringify(query.source), irRevision: query.irRevision, planId: query.planId, clipId: query.clipId }), { signal })
      if (!response.ok) {
        const error = new WorkspaceServerError(response.status, await response.json().catch(() => ({})))
        if (response.status >= 500) observedFailures.add(error)
        throw error
      }
      return response.blob()
    },
    startVoiceover,
    cancelVoiceover: (document, id, signal) => post(url('voiceover/cancel', document), { id }, signal),
    cancelVoiceoverIntent: (document, intent, signal) => post(url('voiceover/cancel', document), { intent }, signal),
    previewVoice: (document, request, signal) => post(url('voice-preview', document), request, signal),
    readVoicePreview: (document, query, signal) => call(url('voice-preview', document, { revision: query.revision, voice: JSON.stringify(query.voice), mode: query.mode, ...query.target ? { target: JSON.stringify(query.target) } : {} }), { signal }),
    subscribeIr: (document, revision, failed) => subscribe(url('ir/events', document), 'revision', revision, failed),
    readDiagnostics: document => call(url('diagnostics', document)),
    subscribeDiagnostics: (document, snapshot, failed) => subscribe(url('diagnostics/events', document), 'diagnostics', snapshot, failed),
    reportDiagnostics: report => post(url('diagnostics'), report),
    reportAuthoringDiagnostics: report => post(url('diagnostics/authoring'), report),
    readPreview: (document, renderer, signal, feedbackOwner) => call(url('preview', document, renderer ? { view: renderer } : {}), { signal }, feedbackOwner),
    prefetchPreview: (document, renderer) => call(url('preview', document, { view: renderer, prefetch: '1' })),
    readWorkbenchInfo: () => {
      workbenchInfo ??= call<WorkbenchAnswer>(url('workbench')).catch((error: unknown) => {
        workbenchInfo = undefined
        throw error
      })
      return workbenchInfo
    },
    readFocus: document => call(url('focus', document)),
    writeFocus: (document, focus) => post(url('focus'), { document, focus }),
    subscribeReview: (document, update) => subscribe(url('review', document), 'review', update),
    acceptReview: (document, body) => post(url('review/accept', document), body),
    rejectReview: (document, paths) => post(url('review/reject', document), paths ? { paths } : {}),
    restoreReview: (document, step) => post(url('review/restore', document), { step }),
    readChanges: document => call(url('changes', document)),
    commitChanges: (document, message, paths) => post(url('changes/commit', document), { message, ...paths ? { paths } : {} }),
    discardChanges: (document, paths) => post(url('changes/discard', document), paths ? { paths } : {}),
    readJobs: document => call(url('jobs', document)),
    startJob: (document, target, source) => post(url('jobs', document), { target, source } satisfies StartJobRequest),
    cancelJob: (document, id) => post(url('jobs/cancel', document), { id }),
    subscribeJobs: (document, changed, failed, ready) => subscribe(url('jobs/events', document), 'job', changed, failed, ready),
    readRevisions: (document, query = {}) => call(url('revisions', document, { query: JSON.stringify(query) })),
    readHistoryFile: (document, query) => call(url('history/file', document, { query: JSON.stringify(query) })),
    revertRevision: (document, request) => post(url('revisions/revert', document), request),
    undo: (document, request) => post(url('history/undo', document), request),
    redo: (document, request) => post(url('history/redo', document), request),
    subscribeApprovals(changed, failed) {
      const address = url('control', '', { observe: 'approvals' })
      const received = (data: string, event?: string) => {
        let value: { id?: unknown, request?: unknown }
        try { value = JSON.parse(data) } catch { return }
        if (typeof value.id !== 'string') return
        if (event === 'approval' && value.request && typeof value.request === 'object') changed({ type: 'approval', id: value.id, request: value.request as ApprovalRequest })
        else if (event === 'settled') changed({ type: 'settled', id: value.id })
      }
      const lost = () => { changed({ type: 'reset' }); failed?.() }
      if (subscription) return subscription(address, 'approvals', received, lost, () => changed({ type: 'reset' }))
      const source = new EventSource(address)
      for (const name of ['approval', 'settled']) source.addEventListener(name, event => received((event as MessageEvent<string>).data, name))
      source.addEventListener('open', () => changed({ type: 'reset' }))
      source.addEventListener('error', lost)
      return () => source.close()
    },
    answerApproval: async (id, allow) => { await post(url('control'), { type: 'answer', id, allow }) },
    readTelemetry: () => call(url('telemetry')),
    sendTelemetry: async (batch, beacon) => {
      const body = JSON.stringify(batch)
      if (beacon && navigator.sendBeacon?.(url('telemetry'), new Blob([body], { type: 'application/json' }))) return
      const response = await fetch(url('telemetry'), { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body, keepalive: Boolean(beacon) })
      if (!response.ok) throw new Error(`the operations were not taken: HTTP ${response.status}`)
    },
  }
}
