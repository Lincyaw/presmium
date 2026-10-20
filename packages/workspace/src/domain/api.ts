import type { Revision } from '@lincyaw/kernel/contracts'
import type { RevisionOperation } from './revisions.ts'

export const WORKSPACE_ID = 'presmium.workspace'

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
  revision?: Revision
  dir?: string
}

export interface HistoryRevision extends Revision {
  operation?: RevisionOperation
  reverts?: string
  redo?: true
}

export interface RevisionsAnswer {
  revisions: HistoryRevision[]
}

export type RevertAnswer = { ok: true, revision: Revision } | { ok: false, conflicts: string[] }

export type LockKind = 'agent' | 'revert' | 'operation'
export function lockKind(holder: string): LockKind {
  return holder.startsWith('agent:') ? 'agent' : holder.endsWith(':revert') ? 'revert' : 'operation'
}

export interface LockedAnswer {
  error: string
  locked: { document: string, holder: string }
}

export const WORKSPACE_FILE = 'presmium.workspace.yaml'

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

export interface ConflictAnswer {
  error: string
  conflict: { version: string, content: string }
}

export type UncommittedKind = 'added' | 'modified' | 'deleted'

export interface UncommittedFile {
  path: string
  kind: UncommittedKind
  added?: number
  removed?: number
}

export interface ChangesAnswer {
  files: UncommittedFile[]
}

export interface CommitAnswer {
  revision?: Revision
  paths: string[]
}
