import type { Finding, IRDocument } from '@presmium/kernel'

export interface WorkspaceDocument {
  dir: string
  title: string
  lang?: string
  tags?: string[]
}

export interface DocumentsAnswer {
  title: string
  documents: WorkspaceDocument[]
  templates: string[]
  git: boolean
  branch?: string
  uncommitted?: number
  single: boolean
}

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

export interface FilesAnswer {
  document: string
  home: boolean
  documents?: string[]
  files: SourceFile[]
  truncated?: true
}

export interface SourceAnswer {
  path: string
  content: string
  version: string
}

export interface SavedAnswer {
  version: string
}

export interface IrAnswer {
  document: string
  revision: string
  doc: IRDocument
  diagnostics: Finding[]
}

export interface IrEvent {
  document: string
  revision: string
  diagnostics: { errors: number, warnings: number }
  files: string[]
}

export interface PreviewAnswer {
  document: string
  web: string
  slides?: string
}

export interface ErrorAnswer {
  error?: string
  detail?: string
  title?: string
  conflict?: { version: string, content: string }
  locked?: { document: string, holder: string }
}

export interface WorkbenchAnswer {
  mcp: string
}
