/**
 * The workbench's client of the workspace service (docs/design-dsh.md 2.3 and
 * 5.1): the page calls `api/presmium/<route>` of its own origin, DeepSeek
 * Harness's host, with the host's cookie (no token in the page); the bundle
 * passes the request on to the service. A request of a document names its
 * directory (`?document=`); `ir/events` is an event stream, which the host
 * forwards as it comes (section 17, item 1).
 */
import type { DocumentOperation, DocumentsAnswer, ErrorAnswer, FilesAnswer, IrAnswer, IrEvent, OperationAnswer, PreviewAnswer, SavedAnswer, SourceAnswer, WorkbenchAnswer } from './api.ts'

/** A refusal of the service: its status, its text, and what a 409 says (a conflict, a lock). */
export class ServiceError extends Error {
  readonly status: number
  readonly answer: ErrorAnswer
  constructor(status: number, answer: ErrorAnswer) {
    super(answer.error ?? answer.detail ?? answer.title ?? `HTTP ${status}`)
    this.status = status
    this.answer = answer
  }
}

/** The service's routes the workbench uses. */
export interface WorkspaceClient {
  documents(document?: string): Promise<DocumentsAnswer>
  operate(operation: DocumentOperation): Promise<OperationAnswer>
  files(document: string): Promise<FilesAnswer>
  source(document: string, path: string): Promise<SourceAnswer>
  save(document: string, path: string, content: string, base: string): Promise<SavedAnswer>
  ir(document: string): Promise<IrAnswer>
  preview(document: string): Promise<PreviewAnswer>
  /** What the bundle says of the service (its own route, `presmium-workbench`): the address of its MCP. */
  workbench(): Promise<WorkbenchAnswer>
  /** Follows the document's compilations; returns the function that stops. */
  events(document: string, revision: (event: IrEvent) => void, failed?: () => void): () => void
}

/** The client of the service behind `base` (relative to the page: the host may serve it under a path). */
export function workspaceClient(base = 'api/presmium/'): WorkspaceClient {
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
  return {
    documents: document => call(url('documents', document)),
    operate: operation => post(url('documents'), operation),
    files: document => call(url('files', document)),
    source: (document, path) => call(url('source', document, { path })),
    save: (document, path, content, base) => post(url('source', document), { path, content, base }),
    ir: document => call(url('ir', document)),
    preview: document => call(url('preview', document)),
    workbench: () => call(url('workbench')),
    events(document, revision, failed) {
      const source = new EventSource(url('ir/events', document))
      source.addEventListener('revision', (event) => {
        try {
          revision(JSON.parse((event as MessageEvent<string>).data) as IrEvent)
        } catch {
          // Not an event of the protocol.
        }
      })
      // EventSource reconnects by itself; the caller hears of a lost stream to read the IR again meanwhile.
      source.addEventListener('error', () => failed?.())
      return () => source.close()
    },
  }
}
