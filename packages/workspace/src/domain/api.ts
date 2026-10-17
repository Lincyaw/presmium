/**
 * The workspace's routes under `/__presmium/presmium.workspace/` (docs/architecture.md
 * 10.2): what the browser plugin sends and gets.
 */
import type { Revision } from '@presmium/kernel/contracts'
import type { RevisionOperation } from './revisions.ts'

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

/**
 * A revision as the history lists it: the contract's, with what its labels
 * need in the reader's language (N-07): the document operation its origin
 * names (a revert's: that of the change it undoes), and the commit it reverts.
 */
export interface HistoryRevision extends Revision {
  operation?: RevisionOperation
  reverts?: string
}

/** `GET revisions?document=&task=&limit=`. */
export interface RevisionsAnswer {
  revisions: HistoryRevision[]
}

/** `POST revisions/revert` with `{ id }`: the revert, or the files in conflict (nothing changed). */
export type RevertAnswer = { ok: true, revision: Revision } | { ok: false, conflicts: string[] }

/**
 * Who holds a document's lock (`DOCUMENT_LOCKS`, F-09), by the holder's name: an agent's change task
 * (`agent:<task id>`), an undo (`…:revert`), or a document operation (`document:<op>`).
 */
export type LockKind = 'agent' | 'revert' | 'operation'
export function lockKind(holder: string): LockKind {
  return holder.startsWith('agent:') ? 'agent' : holder.endsWith(':revert') ? 'revert' : 'operation'
}

/**
 * The 409 of a document operation or an undo while another writer holds a document it changes (F-09):
 * the server's text, and the lock, which the panels say in the reader's language (N-07).
 */
export interface LockedAnswer {
  error: string
  locked: { document: string, holder: string }
}

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

/**
 * `GET site` of a document (or of the home page, document ''): how the member's pages are made
 * (docs/architecture.md 10.10). Editors and owners, and LOCAL mode, have the dev server, which follows
 * each change (`live`); a reader in SHARED mode has the static site built for students (`static`, D17),
 * which follows a change once a new build of the document is in place.
 */
export interface SiteState {
  kind: 'live' | 'static'
  /** A new build of the page's document is coming: a change is not yet in what the reader sees. */
  updating?: boolean
  /** The build served now; another once a new one is in place. */
  version?: string
}
