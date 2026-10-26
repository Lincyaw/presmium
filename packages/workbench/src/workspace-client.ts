import type { CompileJob, DiagnosticSnapshot, DocumentOperation, DocumentsAnswer, ErrorAnswer, FocusAnswer, FocusReport, IrAnswer, IrEvent, JobSource, JobsAnswer, OperationAnswer, PreviewAnswer, PreviewDiagnostics, PreviewRenderer, RevertResult, ReviewEnd, ReviewSnapshot, ReviewUpdate, RevisionsAnswer, SavedAnswer, SourceAnswer, SourceTransactionAnswer, SourceTransactionChange, StartJobRequest, UncommittedFile, WorkbenchAnswer } from '@lincyaw/kernel'
import type { OperationBatch } from './telemetry.ts'
import type { VoiceCatalogAnswer, VoiceoverCancellation, VoiceoverJob, VoiceoverRequest, VoiceoverSnapshot, VoicePreviewAnswer, VoicePreviewQuery, VoicePreviewQuote, VoicePreviewRequest } from '@lincyaw/kernel'
import type { PageDeleteAnswer, PageDeletePlan, PageDeleteRequest } from '@lincyaw/kernel'
import type { DocumentAnswer, DocumentChange, DocumentChangeAnswer, DocumentEvent } from '@lincyaw/kernel'
import type { ProductionMediaQuery, ProductionPlan, ProductionPlanQuery } from '@lincyaw/kernel'

const observedFailures = new WeakSet<object>()
/** Whether the owned request observer already received this transport failure. */
export const isObservedWorkspaceFailure = (error: unknown): boolean => typeof error === 'object' && error !== null && observedFailures.has(error)

/** A route of the workspace server answered with an error. */
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
}

/** The workbench's client of the workspace server's routes; each `subscribe*` returns its unsubscribe. */
export interface WorkspaceClient {
  subscribeRequests?(listener: (event: WorkspaceRequestEvent) => void): () => void
  readDocuments(document?: string): Promise<DocumentsAnswer>
  operateDocument(operation: DocumentOperation): Promise<OperationAnswer>
  readSource(document: string, path: string): Promise<SourceAnswer>
  /** Saves the file; in a git workspace the save is committed at once, `message` its summary. */
  saveSource(document: string, path: string, content: string, base: string, message?: string): Promise<SavedAnswer>
  /** Saves a small set of files in one document with one version and rollback boundary. */
  saveSourceTransaction(document: string, changes: SourceTransactionChange[], message?: string): Promise<SourceTransactionAnswer>
  readIr(document: string): Promise<IrAnswer>
  readDocument(document: string): Promise<DocumentAnswer>
  /** A same-origin display URL; the canonical asset location remains untouched. */
  documentAssetURL(document: string, assetId: string): string
  changeDocument(document: string, change: DocumentChange): Promise<DocumentChangeAnswer>
  subscribeDocument(document: string, changed: (event: DocumentEvent) => void, failed?: () => void): () => void
  readPageDeletion(document: string, section: string): Promise<PageDeletePlan>
  deletePage(document: string, request: PageDeleteRequest): Promise<PageDeleteAnswer>
  readVoiceCatalog(document: string, engine?: string, lang?: string, signal?: AbortSignal): Promise<VoiceCatalogAnswer>
  readVoiceover(document: string, signal?: AbortSignal): Promise<VoiceoverSnapshot>
  readProductionPlan(document: string, query: ProductionPlanQuery, signal?: AbortSignal): Promise<ProductionPlan>
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
  readPreview(document: string, renderer?: PreviewRenderer, signal?: AbortSignal): Promise<PreviewAnswer>
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
  readRevisions(document: string): Promise<RevisionsAnswer>
  revertRevision(document: string, id: string): Promise<RevertResult>
  /** Takes back the document's latest change; `expect` is the `undo` of the history read, refused when it is not the latest any more. */
  undo(document: string, expect?: string): Promise<RevertResult>
  /** Puts back the change the latest undo took back. */
  redo(document: string, expect?: string): Promise<RevertResult>
  /** What the document can be made into, and its builds and exports. */
  readJobs(document: string): Promise<JobsAnswer>
  /** Starts a build or an export of the document (or answers the one already made from this revision). */
  startJob(document: string, target: string, source: JobSource): Promise<CompileJob>
  cancelJob(document: string, id: string): Promise<CompileJob>
  /** Each change of the document's jobs, as it happens. */
  subscribeJobs(document: string, changed: (job: CompileJob) => void, failed?: () => void): () => void
  /** Whether the host collects the workbench's operations for its operator. */
  readTelemetry(): Promise<{ enabled: boolean }>
  /** Sends a batch of operations; `beacon` hands it to the browser to deliver while the page goes away. */
  sendTelemetry(batch: OperationBatch, beacon?: boolean): Promise<void>
}

export function workspaceClient(base = 'api/presmium/'): WorkspaceClient {
  const requestListeners = new Set<(event: WorkspaceRequestEvent) => void>()
  let requestSequence = 0
  const observedFetch = async (address: string, init?: RequestInit): Promise<Response> => {
    const target = new URL(address)
    const prefix = new URL(base, globalThis.document.baseURI).pathname
    const path = target.pathname.slice(prefix.length)
    const method = (init?.method ?? 'GET').toUpperCase()
    if (path === 'telemetry' || path === 'diagnostics' && method === 'POST') return fetch(address, { credentials: 'same-origin', ...init })
    const document = target.searchParams.get('document') ?? undefined
    const requestId = ++requestSequence
    const emit = (kind: WorkspaceRequestEvent['kind'], status?: number) => {
      const event: WorkspaceRequestEvent = { kind, requestId, path, method, ...document !== undefined ? { document } : {}, ...status !== undefined ? { status } : {} }
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
      if (response.status >= 500) emit('failure', response.status)
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
  const call = async <T>(address: string, init?: RequestInit): Promise<T> => {
    const response = await observedFetch(address, init)
    const data = await response.json().catch(() => ({})) as T & ErrorAnswer
    if (!response.ok) {
      const error = new WorkspaceServerError(response.status, data)
      if (response.status >= 500) observedFailures.add(error)
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
  const subscribe = <T>(address: string, name: string, on: (data: T) => void, failed?: () => void) => {
    const source = new EventSource(address)
    source.addEventListener(name, (event) => {
      try {
        on(JSON.parse((event as MessageEvent<string>).data) as T)
      } catch {
        failed?.()
      }
    })
    if (failed) source.addEventListener('error', failed)
    return () => source.close()
  }
  return {
    subscribeRequests: listener => { requestListeners.add(listener); return () => { requestListeners.delete(listener) } },
    readDocuments: document => call(url('documents', document)),
    operateDocument: operation => post(url('documents'), operation),
    readSource: (document, path) => call(url('source', document, { path })),
    saveSource: (document, path, content, base, message) => post(url('source', document), { path, content, base, ...message ? { message } : {} }),
    saveSourceTransaction: (document, changes, message) => post(url('source/transaction', document), { changes, ...message ? { message } : {} }),
    readIr,
    readDocument: document => call(url('document', document)),
    documentAssetURL: (document, asset) => url('document/asset', document, { asset }),
    changeDocument: (document, change) => post(url('document/change', document), change),
    subscribeDocument: (document, changed, failed) => subscribe(url('document/events', document), 'document', changed, failed),
    readPageDeletion: (document, section) => call(url('pages/delete', document, { section })),
    deletePage: (document, request) => post(url('pages/delete', document), request),
    readVoiceCatalog: (document, engine, lang, signal) => call(url('voice-catalog', document, { ...engine ? { engine } : {}, ...lang ? { lang } : {} }), { signal }),
    readVoiceover: (document, signal) => call(url('voiceover', document), { signal }),
    readProductionPlan: (document, query, signal) => call(url('production-plan', document, { source: JSON.stringify(query.source), irRevision: query.irRevision }), { signal }),
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
    readPreview: (document, renderer, signal) => call(url('preview', document, renderer ? { view: renderer } : {}), { signal }),
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
    subscribeJobs: (document, changed, failed) => subscribe(url('jobs/events', document), 'job', changed, failed),
    readRevisions: document => call(url('revisions', document, { limit: '50' })),
    revertRevision: (document, id) => post(url('revisions/revert', document), { id }),
    undo: (document, expect) => post(url('history/undo', document), expect ? { expect } : {}),
    redo: (document, expect) => post(url('history/redo', document), expect ? { expect } : {}),
    readTelemetry: () => call(url('telemetry')),
    sendTelemetry: async (batch, beacon) => {
      const body = JSON.stringify(batch)
      if (beacon && navigator.sendBeacon?.(url('telemetry'), new Blob([body], { type: 'application/json' }))) return
      const response = await fetch(url('telemetry'), { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body, keepalive: Boolean(beacon) })
      if (!response.ok) throw new Error(`the operations were not taken: HTTP ${response.status}`)
    },
  }
}
