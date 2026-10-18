import type { DocumentOperation, DocumentsAnswer, ErrorAnswer, FilesAnswer, IrAnswer, IrEvent, OperationAnswer, PreviewAnswer, SavedAnswer, SourceAnswer, WorkbenchAnswer } from './api.ts'

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
  preview(document: string): Promise<PreviewAnswer>
  workbench(): Promise<WorkbenchAnswer>
  events(document: string, revision: (event: IrEvent) => void, failed?: () => void): () => void
}

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
        }
      })
      source.addEventListener('error', () => failed?.())
      return () => source.close()
    },
  }
}
