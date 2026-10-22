import type { IRDocument } from '../ir.ts'
import type { Focus } from './agent.ts'
import type { Finding } from './checks.ts'
import type { Member } from './server.ts'
import { defineService } from './service.ts'

export type ReviewChangeKind = 'added' | 'modified' | 'deleted'

export interface ReviewChange {
  path: string
  kind: ReviewChangeKind
  binary: boolean
  added: number
  removed: number
  diff?: string
}

export interface ReviewStep {
  id: string
  label: string
  tool?: string
  at: string
  changes: ReviewChange[]
}

export interface ChangeReview {
  readonly root: string
  readonly visibility: 'immediate' | 'on-commit'
  step(label: string, tool?: string): Promise<ReviewStep>
  steps(): readonly ReviewStep[]
  diff(): Promise<ReviewChange[]>
  restoreTo?(stepId: string): Promise<void>
  accept(reject?: string[]): Promise<string[]>
  rollback(): Promise<void>
  close(): Promise<void>
}

export interface ChangeReviewService {
  readonly engine: string
  open(options: { document: string, task: string, member: Member }): Promise<ChangeReview>
}

export const CHANGE_REVIEW = defineService<ChangeReviewService>('presmium.changeReview')

export interface RevisionOrigin {
  kind: 'agent' | 'document' | 'editor'
  task?: string
  member?: Member
}

export interface Revision {
  id: string
  message: string
  author: string
  date: string
  origin: RevisionOrigin
  files: string[]
  revertedBy?: string
}

export type RevertResult = { ok: true, revision: Revision } | { ok: false, conflicts: string[] }

export interface RevisionService {
  commit(change: { files: string[], message: string, origin: RevisionOrigin }): Promise<Revision | undefined>
  history(filter?: { document?: string, task?: string, limit?: number }): Promise<Revision[]>
  revert(id: string, member: Member): Promise<RevertResult>
}

export const REVISIONS = defineService<RevisionService>('presmium.revisions')

export interface DocumentLockService {
  claim(document: string, holder: string): (() => void) | undefined
  holder(document: string): string | undefined
}

export const DOCUMENT_LOCKS = defineService<DocumentLockService>('presmium.documentLocks')

export type DocumentFileChange =
  | { path: string, content: Uint8Array, executable?: boolean, at?: number }
  | { path: string, link: string }
  | { path: string, remove: true }

export interface DocumentFiles {
  write(changes: DocumentFileChange[]): Promise<void>
}

export const DOCUMENT_FILES = defineService<DocumentFiles>('presmium.documentFiles')

/** A document as lists show it: its directory (its identity), title, language and tags. */
export interface DocumentSummary {
  dir: string
  title: string
  lang?: string
  tags?: string[]
}

/** @experimental The workspace service's answer to `documents`. */
export interface DocumentsAnswer {
  title: string
  documents: DocumentSummary[]
  templates: string[]
  git: boolean
  branch?: string
  uncommitted?: number
  single: boolean
}

/** @experimental */
export type DocumentOperation =
  | { op: 'create', dir: string, title?: string, template?: string }
  | { op: 'rename', dir: string, to: string }
  | { op: 'copy', dir: string, to: string }
  | { op: 'delete', dir: string }

/** @experimental A document operation as its commit records it. */
export type RevisionOperation =
  | { op: 'create', dir: string }
  | { op: 'delete', dir: string }
  | { op: 'rename', dir: string, to: string }
  | { op: 'copy', dir: string, to: string }

/** @experimental */
export interface OperationAnswer {
  revision?: Revision
  dir?: string
}

/** @experimental A revision as the history lists it; reverting a revert is a redo. */
export interface HistoryRevision extends Revision {
  operation?: RevisionOperation
  reverts?: string
  redo?: true
}

/** @experimental */
export interface RevisionsAnswer {
  revisions: HistoryRevision[]
}

/** @experimental */
export interface LockedAnswer {
  error: string
  locked: { document: string, holder: string }
}

/** @experimental A file of the workspace that the workbench can open. */
export interface SourceFile {
  path: string
  binary?: true
}

/** @experimental */
export interface FilesAnswer {
  document: string
  home: boolean
  documents?: string[]
  files: SourceFile[]
  truncated?: true
}

/** @experimental */
export interface SourceAnswer {
  path: string
  content: string
  version: string
}

/** @experimental */
export interface SavedAnswer {
  version: string
}

/** @experimental */
export interface ConflictAnswer {
  error: string
  conflict: { version: string, content: string }
}

/** @experimental The body of a failed request to the workspace service. */
export interface ErrorAnswer {
  error?: string
  detail?: string
  title?: string
  conflict?: { version: string, content: string }
  locked?: { document: string, holder: string }
  exists?: true
}

/** @experimental */
export type UncommittedKind = 'added' | 'modified' | 'deleted'

/** @experimental */
export interface UncommittedFile {
  path: string
  kind: UncommittedKind
  added?: number
  removed?: number
}

/** @experimental */
export interface ChangesAnswer {
  files: UncommittedFile[]
}

/** @experimental */
export interface CommitAnswer {
  revision?: Revision
  paths: string[]
}

/** @experimental The compiled document with its IR revision. */
export interface IrAnswer {
  document: string
  revision: string
  doc: IRDocument
  diagnostics: Finding[]
}

/** @experimental Sent on `ir/events` after each compilation. */
export interface IrEvent {
  document: string
  revision: string
  diagnostics: { errors: number, warnings: number }
  files: string[]
}

/** @experimental The renderer a preview shows. */
export type PreviewRenderer = 'web' | 'slides'

/** @experimental The dev servers' addresses for a document's previews. */
export interface PreviewAnswer {
  document: string
  web: string
  slides?: string
}

/** @experimental */
export interface WorkbenchAnswer {
  mcp: string
  root?: string
}

/** @experimental */
export interface FocusAnswer {
  document?: string
  focus: Focus[] | null
  reported?: string
}

/** @experimental The state of a change review as the workspace service shows it. */
export interface ReviewSnapshot {
  id: string
  document: string
  engine: string
  session: string
  holder: string
  turns: { from: number, to: number }
  running: boolean
  mode: 'required' | 'auto'
  opened: string
  steps: ReviewStep[]
  changes: ReviewChange[]
}

/** @experimental */
export interface ReviewEnd {
  outcome: 'accepted' | 'rejected' | 'rolled-back' | 'empty'
  revision?: Revision
  files: string[]
}

/** @experimental Sent on the `review` stream: the document's current review, or how it ended. */
export interface ReviewUpdate {
  document: string
  review?: ReviewSnapshot
  ended?: ReviewEnd
}
