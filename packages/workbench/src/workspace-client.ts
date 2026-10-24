import type { DiagnosticSnapshot, DocumentOperation, DocumentsAnswer, ErrorAnswer, FocusAnswer, FocusReport, IrAnswer, IrEvent, OperationAnswer, PreviewAnswer, PreviewDiagnostics, PreviewRenderer, RevertResult, ReviewEnd, ReviewSnapshot, ReviewUpdate, RevisionsAnswer, SavedAnswer, SourceAnswer, UncommittedFile, WorkbenchAnswer } from '@lincyaw/kernel'
import type { OperationBatch } from './telemetry.ts'

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

/** The workbench's client of the workspace server's routes; each `subscribe*` returns its unsubscribe. */
export interface WorkspaceClient {
  readDocuments(document?: string): Promise<DocumentsAnswer>
  operateDocument(operation: DocumentOperation): Promise<OperationAnswer>
  readSource(document: string, path: string): Promise<SourceAnswer>
  /** Saves the file; in a git workspace the save is committed at once, `message` its summary. */
  saveSource(document: string, path: string, content: string, base: string, message?: string): Promise<SavedAnswer>
  readIr(document: string): Promise<IrAnswer>
  subscribeIr(document: string, revision: (event: IrEvent) => void, failed?: () => void): () => void
  readDiagnostics(document: string): Promise<DiagnosticSnapshot>
  subscribeDiagnostics(document: string, snapshot: (event: DiagnosticSnapshot) => void, failed: () => void): () => void
  reportDiagnostics(report: PreviewDiagnostics): Promise<unknown>
  readPreview(document: string, renderer?: PreviewRenderer): Promise<PreviewAnswer>
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
  /** Whether the host collects the workbench's operations for its operator. */
  readTelemetry(): Promise<{ enabled: boolean }>
  /** Sends a batch of operations; `beacon` hands it to the browser to deliver while the page goes away. */
  sendTelemetry(batch: OperationBatch, beacon?: boolean): Promise<void>
}

export function workspaceClient(base = 'api/presmium/'): WorkspaceClient {
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
    const response = await fetch(address, { credentials: 'same-origin', ...init })
    const data = await response.json().catch(() => ({})) as T & ErrorAnswer
    if (!response.ok) throw new WorkspaceServerError(response.status, data)
    return data
  }
  const post = <T>(address: string, body: unknown) => call<T>(address, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
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
    const response = await fetch(url('ir', document), {
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
    if (!response.ok) throw new WorkspaceServerError(response.status, data)
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
    readDocuments: document => call(url('documents', document)),
    operateDocument: operation => post(url('documents'), operation),
    readSource: (document, path) => call(url('source', document, { path })),
    saveSource: (document, path, content, base, message) => post(url('source', document), { path, content, base, ...message ? { message } : {} }),
    readIr,
    subscribeIr: (document, revision, failed) => subscribe(url('ir/events', document), 'revision', revision, failed),
    readDiagnostics: document => call(url('diagnostics', document)),
    subscribeDiagnostics: (document, snapshot, failed) => subscribe(url('diagnostics/events', document), 'diagnostics', snapshot, failed),
    reportDiagnostics: report => post(url('diagnostics'), report),
    readPreview: (document, renderer) => call(url('preview', document, renderer ? { view: renderer } : {})),
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
