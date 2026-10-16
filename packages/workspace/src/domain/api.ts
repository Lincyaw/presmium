/**
 * The workspace's routes under `/__presmium/presmium.workspace/` (docs/architecture.md
 * 10.2): what the browser plugin sends and gets.
 */
import type { Revision } from '@presmium/kernel/contracts'

/** Plugin id of the workspace: its routes, its browser plugin and its operator settings (`settings.presmium.workspace`). */
export const WORKSPACE_ID = 'presmium.workspace'

/** A document of the workspace, as listed (only its headmatter is read). */
export interface WorkspaceDocument {
  /** Its directory, relative to the workspace root; '' in a single-deck repository. */
  dir: string
  title: string
  lang?: string
  tags?: string[]
}

/** `GET documents`. */
export interface DocumentsAnswer {
  documents: WorkspaceDocument[]
  /** Names of the document templates. */
  templates: string[]
  /** The workspace is a git repository: the document operations and the history work. */
  git: boolean
  /** The workspace root is the one document (a single-deck repository): no document operations. */
  single: boolean
}

/** `POST documents`: one document operation, each one commit (`Presmium-Origin: document`). */
export type DocumentOperation =
  | { op: 'create', dir: string, title?: string, template?: string }
  | { op: 'rename', dir: string, to: string }
  | { op: 'copy', dir: string, to: string }
  | { op: 'delete', dir: string }

export interface OperationAnswer {
  /** The commit it made. */
  revision?: Revision
  /** The document directory after the operation (create, rename, copy). */
  dir?: string
}

/** `GET revisions?document=&task=&limit=`. */
export interface RevisionsAnswer {
  revisions: Revision[]
}

/** `POST revisions/revert` with `{ id }`: the revert, or the files in conflict (nothing changed). */
export type RevertAnswer = { ok: true, revision: Revision } | { ok: false, conflicts: string[] }

/**
 * `GET execution` of a document (SHARED `presmium serve`, docs/architecture.md
 * 10.6): its code without a recording that has not run, and whether a
 * compile approval waits; `POST execution` asks again.
 */
export interface ExecutionState {
  /** `settings.presmium.exec.compile`; `local` in LOCAL mode, where all code runs. */
  mode: 'local' | 'approve' | 'trusted' | 'off'
  /** Code blocks of the last compilation that did not run, as `<section>#<block>`. */
  notRun: string[]
  /** A compile approval of this document waits for the owner. */
  pending: boolean
}
