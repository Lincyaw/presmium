/**
 * The workspace service's interface as the workbench reads it (docs/design-dsh.md
 * 5.1): the answers of its routes, which the page reaches at `/api/presmium/<route>`
 * of DeepSeek Harness's host (the bundle's `presmium-routes` passes them on with
 * the service token, 2.3). Paths are relative to the workspace root; a request of
 * a document names its directory (`?document=`).
 */
import type { Finding, IRDocument } from '@presmium/kernel'

/** A document of the workspace, as listed. */
export interface WorkspaceDocument {
  /** Its directory, relative to the workspace root; '' in a single-deck repository. */
  dir: string
  title: string
  lang?: string
  tags?: string[]
}

/** `GET documents`. */
export interface DocumentsAnswer {
  title: string
  documents: WorkspaceDocument[]
  templates: string[]
  /** The workspace is a git repository: the document operations work. */
  git: boolean
  branch?: string
  /** Files with changes not committed, in the request's scope. */
  uncommitted?: number
  /** The workspace root is the one document: no document operations. */
  single: boolean
}

/** `POST documents`: one document operation, one commit. */
export type DocumentOperation =
  | { op: 'create', dir: string, title?: string, template?: string }
  | { op: 'rename', dir: string, to: string }
  | { op: 'copy', dir: string, to: string }
  | { op: 'delete', dir: string }

export interface OperationAnswer {
  revision?: { id: string, summary?: string }
  dir?: string
}

export interface SourceFile {
  path: string
  binary?: true
}

/** `GET files`. */
export interface FilesAnswer {
  document: string
  home: boolean
  documents?: string[]
  files: SourceFile[]
  truncated?: true
}

/** `GET source?path=`: the text on disk and its version. */
export interface SourceAnswer {
  path: string
  content: string
  version: string
}

/** `POST source` with `{ path, content, base }`. */
export interface SavedAnswer {
  version: string
}

/** `GET ir`: the document's IR (paths relative to the workspace root), its revision and its diagnostics. */
export interface IrAnswer {
  document: string
  revision: string
  doc: IRDocument
  diagnostics: Finding[]
}

/** An event of `GET ir/events` (`event: revision`). */
export interface IrEvent {
  document: string
  revision: string
  diagnostics: { errors: number, warnings: number }
  /** The files (relative to the workspace root) whose change made this compilation. */
  files: string[]
}

/** `GET preview`: the address of each form's preview, on the workspace service's origin. */
export interface PreviewAnswer {
  document: string
  web: string
  slides?: string
}

/** The body of an answer that is not 2xx. */
export interface ErrorAnswer {
  error?: string
  detail?: string
  title?: string
  /** 409 of a save: the file changed on disk since it was opened. */
  conflict?: { version: string, content: string }
  /** 409: another writer holds the document (an agent's review, an undo). */
  locked?: { document: string, holder: string }
}

/** `GET workbench`, the bundle's own route (`presmium-workbench`): where the workspace service's MCP is. */
export interface WorkbenchAnswer {
  mcp: string
}
