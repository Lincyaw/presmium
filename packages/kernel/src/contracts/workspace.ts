import type { IRDocument } from '../ir.ts'
import type { TeachingDocument, DocumentEditOperation, DocumentIssue } from './document.ts'
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

/** @experimental The history of a document, newest first, and the revisions the next undo and redo take back. */
export interface RevisionsAnswer {
  revisions: HistoryRevision[]
  /** The revision `history/undo` reverts. */
  undo?: string
  /** The revision `history/redo` reverts: the latest undo. */
  redo?: string
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

/** The editable authority, available without building a runtime preview. */
export interface DocumentAnswer {
  document: string
  version: string
  /** FNV-1a-64 of the exact authoritative bytes used to match a runtime snapshot. */
  fingerprint: string
  content: TeachingDocument
  issues: DocumentIssue[]
}

/** Both author UIs and agents use this versioned submission boundary. */
export interface DocumentChange {
  id: string
  baseDocumentVersion: string
  replacement?: TeachingDocument
  operations?: DocumentEditOperation[]
  fileChanges?: SourceTransactionChange[]
}

export interface DocumentChangeAnswer extends DocumentAnswer {
  changeId: string
  files: { path: string, version: string }[]
  commit?: Revision
}

export interface DocumentEvent { document: string, version: string, valid: boolean, issues: DocumentIssue[], projectRevision?: string }

/** @experimental A saved source file; in a git workspace the save is a revision of its own. */
export interface SavedAnswer {
  version: string
  revision?: Revision
}

/** @experimental A fresh page-removal check; confirmation applies only to this source version. */
export interface PageDeletePlan {
  document: string
  section: string
  revision: string
  source: { path: string, version: string }
  counts: { steps: number, blocks: number, narration: number }
  last: boolean
  allowed: boolean
  reason?: string
  references?: { document: string, section: string, block?: string }[]
}

/** @experimental Removes one page or retains an empty page when it was the last one. */
export interface PageDeleteRequest { section: string, revision: string, base: string }
export interface PageDeleteAnswer { document: string, selected: string, retainedEmpty: boolean, sourceVersion: string, irRevision: string, commit?: Revision }

/** @experimental One version-checked file in an authoring transaction; null creates a new file exclusively. */
export interface SourceTransactionChange {
  path: string
  content: string
  base: string | null
}

/** @experimental Files saved together as one revision, or left unchanged together on failure. */
export interface SourceTransactionAnswer {
  versions: { path: string, version: string }[]
  revision?: Revision
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
  ignored?: string[]
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

/** Source syntax supported by the compiler that produced an answer, independent of authored metadata. */
export interface SourceCapabilities {
  unicodePageTargets?: true
}

/** @experimental The compiled document with its IR revision. */
export interface IrAnswer {
  document: string
  revision: string
  doc: IRDocument
  diagnostics: Finding[]
  sourceCapabilities?: SourceCapabilities
  /** FNV-1a-64 of the exact authoring JSON text, including BOM; workspace-relative source paths. */
  sourceFingerprints?: Record<string, string>
  /** Workspace authoring endpoints available beside this compilation. */
  authoring?: { deletePage?: true }
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

/** @experimental What a document can be made into: its renderers and its plugins' exporters. */
export interface OutputTarget {
  id: string
  kind: 'render' | 'export'
  /** By language; a renderer's id when its plugin gave none. */
  label: Record<string, string>
}

/** @experimental */
export type JobState = 'queued' | 'running' | 'done' | 'failed' | 'cancelled'

/** @experimental A file a job made, below the job's address. */
export interface JobFile {
  path: string
  size: number
  /** Its media type, by its extension. */
  type: string
}

/** @experimental A build or an export of a document, run by the workspace service one at a time. */
export interface CompileJob {
  id: string
  /** Grows with each change of the job: of two copies, a client keeps the one with the greater. */
  sequence: number
  document: string
  target: string
  kind: OutputTarget['kind']
  state: JobState
  /** The IR revision it was made from: a job of the same target and revision is not run again. */
  revision: string
  /** Taken from an earlier job of the same target and revision. */
  cached?: boolean
  progress?: { phase: string, done?: number, total?: number }
  createdAt: string
  startedAt?: string
  finishedAt?: string
  /** The address its files are below (`<url><path>`). */
  url: string
  files: JobFile[]
  /** The file to open first: a site's page, the video, the PDF. */
  main?: string
  /** The WebVTT captions of the main file (a video), by language. */
  captions?: Record<string, string>
  error?: string
  warnings: string[]
  /** The last lines of its log. */
  log: string[]
}

/** @experimental The documents' builds and exports as jobs, as a host offers them (the workspace service). */
export interface OutputJobs {
  /** What the document can be made into. */
  targets(document: string): Promise<OutputTarget[]>
  /** The jobs of the document (all, without one), newest first. */
  list(document?: string): CompileJob[]
  /** Starts a job of `target` for the document as it is now, or answers the one already made from this revision. */
  start(document: string, target: string): Promise<CompileJob>
  /** Settles once the job has ended. */
  wait(id: string): Promise<CompileJob>
  cancel(id: string): CompileJob | undefined
}

/** @experimental */
export interface JobsAnswer {
  targets: OutputTarget[]
  jobs: CompileJob[]
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
