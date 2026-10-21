import type { FocusReport } from '@lincyaw/kernel'
import type { DocumentOperation, DocumentsAnswer, ErrorAnswer, FilesAnswer, FocusAnswer, HistoryRevision, IrAnswer, IrEvent, OperationAnswer, PreviewAnswer, PreviewView, RevertAnswer, ReviewEnd, ReviewFollowed, ReviewView, SavedAnswer, SourceAnswer, UncommittedFile, WorkbenchAnswer } from './api.ts'

export class ServiceError extends Error {
  readonly status: number
  readonly answer: ErrorAnswer
  constructor(status: number, answer: ErrorAnswer) {
    super(answer.error ?? answer.detail ?? answer.title ?? `HTTP ${status}`)
    this.status = status
    this.answer = answer
  }
}

export interface WorkspaceClient {
  documents(document?: string): Promise<DocumentsAnswer>
  operate(operation: DocumentOperation): Promise<OperationAnswer>
  files(document: string): Promise<FilesAnswer>
  source(document: string, path: string): Promise<SourceAnswer>
  save(document: string, path: string, content: string, base: string): Promise<SavedAnswer>
  ir(document: string): Promise<IrAnswer>
  preview(document: string, view?: PreviewView): Promise<PreviewAnswer>
  workbench(): Promise<WorkbenchAnswer>
  focus(document: string, focus?: FocusReport[]): Promise<FocusAnswer>
  events(document: string, revision: (event: IrEvent) => void, failed?: () => void): () => void
  review(document: string, followed: (event: ReviewFollowed) => void): () => void
  accept(document: string, body: { reject?: string[], message?: string }): Promise<{ ended: ReviewEnd }>
  reject(document: string, paths?: string[]): Promise<ReviewFollowed>
  restore(document: string, step: string): Promise<{ review: ReviewView }>
  changes(document: string): Promise<{ files: UncommittedFile[] }>
  commit(document: string, message: string, paths?: string[]): Promise<unknown>
  discard(document: string, paths?: string[]): Promise<unknown>
  revisions(document: string): Promise<{ revisions: HistoryRevision[] }>
  revert(document: string, id: string): Promise<RevertAnswer>
}

export function workspaceClient(base = 'api/presmium/'): WorkspaceClient {
  const irCacheLimit = 16 << 20
  type CachedIR = { etag: string, answer: IrAnswer, bytes: number }
  const irCache = new Map<string, CachedIR>()
  const irPending = new Map<string, Promise<IrAnswer>>()
  let irBytes = 0
  const url = (path: string, document?: string, query: Record<string, string> = {}) => {
    const address = new URL(`${base}${path}`, globalThis.document.baseURI)
    if (document !== undefined) address.searchParams.set('document', document)
    for (const [name, value] of Object.entries(query)) address.searchParams.set(name, value)
    return address.href
  }
  const call = async <T>(address: string, init?: RequestInit): Promise<T> => {
    const response = await fetch(address, { credentials: 'same-origin', ...init })
    const data = await response.json().catch(() => ({})) as T & ErrorAnswer
    if (!response.ok) throw new ServiceError(response.status, data)
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
  const readIR = async (document: string): Promise<IrAnswer> => {
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
    if (!response.ok) throw new ServiceError(response.status, data)
    const etag = response.headers.get('ETag')
    // Account for UTF-16 response text; the parsed object's heap size is a soft limit.
    const bytes = text.length * 2
    rememberIR(document, response.status === 200 && etag && bytes <= irCacheLimit ? { etag, answer: data, bytes } : undefined)
    return data
  }
  const ir = (document: string): Promise<IrAnswer> => {
    const pending = irPending.get(document)
    if (pending) return pending
    const request = readIR(document).finally(() => {
      if (irPending.get(document) === request) irPending.delete(document)
    })
    irPending.set(document, request)
    return request
  }
  const follow = <T>(address: string, name: string, on: (data: T) => void, failed?: () => void) => {
    const source = new EventSource(address)
    source.addEventListener(name, (event) => {
      try {
        on(JSON.parse((event as MessageEvent<string>).data) as T)
      } catch {
      }
    })
    if (failed) source.addEventListener('error', failed)
    return () => source.close()
  }
  return {
    documents: document => call(url('documents', document)),
    operate: operation => post(url('documents'), operation),
    files: document => call(url('files', document)),
    source: (document, path) => call(url('source', document, { path })),
    save: (document, path, content, base) => post(url('source', document), { path, content, base }),
    ir,
    preview: (document, view) => call(url('preview', document, view ? { view } : {})),
    workbench: () => call(url('workbench')),
    focus: (document, focus) => focus === undefined ? call(url('focus', document)) : post(url('focus'), { document, focus }),
    events: (document, revision, failed) => follow(url('ir/events', document), 'revision', revision, failed),
    review: (document, followed) => follow(url('review', document), 'review', followed),
    accept: (document, body) => post(url('review/accept', document), body),
    reject: (document, paths) => post(url('review/reject', document), paths ? { paths } : {}),
    restore: (document, step) => post(url('review/restore', document), { step }),
    changes: document => call(url('changes', document)),
    commit: (document, message, paths) => post(url('changes/commit', document), { message, ...paths ? { paths } : {} }),
    discard: (document, paths) => post(url('changes/discard', document), paths ? { paths } : {}),
    revisions: document => call(url('revisions', document, { limit: '50' })),
    revert: (document, id) => post(url('revisions/revert', document), { id }),
  }
}
