/**
 * Agents (P-110 to P-114, P-136), readers' questions (P-112), change review
 * (D12) and revision history (P-115, P-121); docs/architecture.md 4.8 and 10.7.
 */
import type { ApprovalRequest, McpAccess, Member } from './server.ts'
import { defineService } from './service.ts'
import type { ServiceToken } from './service.ts'

export interface SourceRange { file: string, startLine: number, endLine: number }

/**
 * Where the user points (P-116, decision G-8, docs/design-dsh.md section 8):
 * a range of the source, with its place in the document. A selection in the
 * source editor and a pick in the web or slides preview end up as one. The
 * server resolves what the workbench reports (`FocusReport`) into it and keeps
 * the latest of each document (`presmium.server/focus`); MCP reads it as
 * `presmium://focus` and `get_focus`, and the bundle puts it in a session's
 * document context.
 *
 * @experimental The new workbench's (docs/api.md section 3).
 */
export interface Focus {
  id: string
  /** Where it was pointed at. */
  from: 'source' | 'web' | 'slides'
  /** The document directory, relative to the workspace root. */
  document: string
  /** The range of the source, always there; its file is relative to the document directory. */
  source: SourceRange
  /** The source's text of that range: read from the file by the server, never taken from the page. */
  excerpt: string
  /**
   * Its place in the document: a pick in a preview names the section and the
   * block, one in the slides also the step; for a selection in the editor the
   * server finds the section and block by line.
   */
  section?: string
  block?: string
  step?: number
  /** The text selected in the page, to help an agent find those words in the block. */
  quote?: string
}

/**
 * What the workbench reports of a focus before the server resolves it
 * (`POST presmium.server/focus`): a block of a preview (`section`, `block`,
 * `step`), or a range of the source editor (`source`).
 *
 * @experimental The new workbench's (docs/api.md section 3).
 */
export interface FocusReport {
  id: string
  from: Focus['from']
  section?: string
  block?: string
  step?: number
  quote?: string
  source?: SourceRange
}

export interface AgentContext {
  /** Document directory, relative to the workspace root. */
  document: string
  section?: string
  step?: number
  block?: string
  view?: string
  /** The selected text. */
  selection?: string
  source?: SourceRange
  /** What the user points at (G-8); without any, the place above is the passive focus. */
  focus?: Focus[]
}

/**
 * The change tasks (`chat` also drafts new documents), which the assistant
 * handles by one rule: one task per document, one commit through `REVISIONS`
 * at its end, revertible, writes out of scope confirmed. Readers' questions
 * are no task of the server's: the page asks the reader's own model (`ASK`).
 */
export type AgentTaskKind = 'annotations' | 'chat' | 'transcript'

export type AnnotationStatus = 'draft' | 'sent' | 'done' | 'failed'

export interface Annotation {
  id: string
  section: string
  block: string
  source: SourceRange
  /** The annotated source excerpt. */
  excerpt: string
  /** What is asked. */
  request: string
  status: AnnotationStatus
  /** The agent's note. */
  note?: string
  /** The focus the annotation is on (G-8); `section`, `block`, `source` and `excerpt` above agree with it. */
  focus?: Focus
}

export interface AgentTaskRequest {
  kind: AgentTaskKind
  /** The chat message or the overall request. */
  prompt: string
  context: AgentContext
  /** The annotations of an `annotations` task. */
  annotations?: Annotation[]
  /** The lecture track id of a `transcript` task. */
  track?: string
}

export interface Citation {
  /** The text shown. */
  label: string
  section: string
  step?: number
  block?: string
}

export type AgentEvent =
  /** Progress of a tool call: `call` is ACP's `toolCallId`; `completed` makes the assistant record a review checkpoint. */
  | { type: 'progress', text: string, tool?: string, call?: string, status?: 'running' | 'completed' | 'failed' }
  | { type: 'message', text: string, citations?: Citation[] }
  | { type: 'approval', id: string, request: ApprovalRequest }
  | { type: 'annotation', id: string, status: AnnotationStatus, note?: string }
  /** The checkpoint after a tool call (change tasks). */
  | { type: 'step', step: ReviewStep }
  /** A change task ended and awaits its requester's review (`settings.presmium.assistant.review: required`): the changes of the task and its steps. */
  | { type: 'review', engine: string, changes: ReviewChange[], steps: ReviewStep[] }
  | { type: 'done', revision?: string }
  | { type: 'error', message: string }

/**
 * The requester's decision on a change task.
 *
 * @experimental The workbench's browser side, outside the 1.x semver promise (docs/api.md section 3).
 */
export type ReviewDecision =
  /** Accept; the files of `reject` (relative to the workspace root) go back to their content when the task started, files the task created are deleted. */
  | { accept: true, reject?: string[] }
  /** Reject all: back to the state when the task started. */
  | { accept: false }

/** @experimental The workbench's browser side, outside the 1.x semver promise (docs/api.md section 3). */
export interface AgentTask {
  readonly id: string
  readonly events: AsyncIterable<AgentEvent>
  cancel(): void
  /** Answers the `review` event; only the member who started the task and owners may. */
  review(decision: ReviewDecision): Promise<void>
  /**
   * Undoes the task's commit once it is `done` (P-115): `git revert` through
   * `REVISIONS`, or the files that conflict, nothing committed. Throws with
   * the server's reason when it cannot (no commit of the task, a change task
   * of the document under way).
   */
  revert(): Promise<TaskRevertResult>
}

/**
 * The undo of a change task's commit (`AgentTask.revert`): the id of the commit that reverted it, or the files that conflict.
 *
 * @experimental The workbench's browser side, outside the 1.x semver promise (docs/api.md section 3).
 */
export type TaskRevertResult = { ok: true, revision: string } | { ok: false, conflicts: string[] }

/**
 * In the browser: a page submits tasks to the server's assistant.
 *
 * @experimental The workbench's browser side, outside the 1.x semver promise (docs/api.md section 3).
 */
export interface AgentClient {
  /** The server has an agent runtime (the operator configured model access, or a replacement runtime) and the member may submit tasks of this kind. */
  available(kind: AgentTaskKind): boolean
  /** The model's service provider, e.g. `DeepSeek`, from the operator's settings; the change panels show it (N-08). Undefined when unavailable. */
  provider(): string | undefined
  /** Name and version of the agent runtime (`AgentRuntime.runtime`), shown apart from the provider; undefined before the agent started. */
  runtime(): string | undefined
  submit(request: AgentTaskRequest): AgentTask
}

/** @experimental The workbench's browser side, outside the 1.x semver promise (docs/api.md section 3). */
export const AGENT = defineService<AgentClient>('presmium.agent')

/**
 * In the browser: the model service a reader filled in for himself (P-112,
 * decision E-9), asked from the page directly, never through the site's
 * server: an OpenAI-compatible Chat Completions service, its address, key
 * and model kept in this site's browser storage. The assistant provides it
 * in every page, static output included; the classroom's "AI answer" asks
 * the presenter's own.
 */
export interface AskClient {
  /** The service's provider as the panels name it (N-08), from its address; undefined until the reader filled it in. */
  provider(): string | undefined
  /**
   * Asks about the deck: the context is the place (`section`, `step`,
   * `block`, the selected text), with which the page adds what it shows
   * there (the section's text, the table of contents). Yields the answer as
   * it streams, piece by piece, its citations as `[label](presmium://sections/<id>)`;
   * throws with the service's reason; ends when `signal` aborts.
   */
  ask(question: string, context: AgentContext, signal?: AbortSignal): AsyncIterable<string>
}

export const ASK = defineService<AskClient>('presmium.ask')

export interface AgentSessionOptions {
  /**
   * The `cwd` of ACP `session/new`, also the root the agent's file tools may
   * write: `ChangeReview.root` (the document directory, or its deltabox
   * view). Writing outside it goes through the agent's permission request,
   * of `workspace` scope.
   */
  cwd: string
  member: Member
  /**
   * Presmium's MCP service, written to `mcpServers` of ACP `session/new`
   * (HTTP, with an `Authorization` header). The caller gets it from
   * `MCP_ENDPOINT.issue(member, 'author')` and revokes it when the session
   * closes; omitted, the agent has no Presmium tools.
   */
  mcp?: McpAccess
  /** The agent's own permission requests (ACP `session/request_permission`) are confirmed through it. */
  approve(request: ApprovalRequest): Promise<boolean>
}

export interface AgentSession {
  prompt(request: AgentTaskRequest, signal?: AbortSignal): AsyncIterable<AgentEvent>
  cancel(): Promise<void>
  close(): Promise<void>
}

/**
 * In Node: drives an agent; the one implementation is the ACP client. The
 * runtime uses the model credentials the operator gave: in this process's
 * environment, or in the page's model settings (P-111), which apply to the
 * next session without a restart.
 */
export interface AgentRuntime {
  /**
   * The model's service provider, known before starting: for the bundled
   * DeepSeek Harness from the operator's model access (`DeepSeek` for
   * `DEEPSEEK_API_KEY`, `PRESMIUM_MODEL_PROVIDER`, or the page's model
   * settings); for a replacement runtime `settings.presmium.assistant.provider`
   * or `PRESMIUM_AGENT_PROVIDER`. Undefined while the operator configured
   * neither: `open` then fails.
   */
  readonly provider: string | undefined
  /** Name and version the agent reports in ACP `initialize` (`agentInfo`, e.g. `DeepSeek Harness 0.2.0`); undefined before the first agent started. */
  readonly runtime?: string
  open(options: AgentSessionOptions): Promise<AgentSession>
}

export const AGENT_RUNTIME = defineService<AgentRuntime>('presmium.agentRuntime')

export type AgentToolKind = 'read' | 'operate' | 'spend'

export interface AgentToolContext {
  document: string
  member: Member
  service<T>(token: ServiceToken<T>): T | undefined
  signal: AbortSignal
}

export interface AgentTool {
  /** MCP tool name, lowercase with underscores, e.g. `lecture_preview`. */
  name: string
  description: string
  /** JSON Schema of the input (an object). */
  input: Record<string, unknown>
  /** `operate` and `spend` are confirmed through `APPROVALS` by the MCP service before the call. */
  kind: AgentToolKind
  /** Returns JSON data or text, the tool result. */
  run(input: Record<string, unknown>, ctx: AgentToolContext): Promise<unknown>
}

// Change review (P-113 to P-115, D12) -----------------------------------------------

export type ReviewChangeKind = 'added' | 'modified' | 'deleted'

/** A file's change against the base of comparison. */
export interface ReviewChange {
  /** Relative to the workspace root. */
  path: string
  kind: ReviewChangeKind
  binary: boolean
  /** Lines added and removed; 0 for binary files. */
  added: number
  removed: number
  /** Unified diff text; omitted for binary files and diffs too large. */
  diff?: string
}

/** The checkpoint after a tool call: the changes since the previous checkpoint. */
export interface ReviewStep {
  id: string
  /** The tool call's title. */
  label: string
  /** The tool's name. */
  tool?: string
  /** ISO 8601. */
  at: string
  changes: ReviewChange[]
}

/** The review of one change task, from its start to its acceptance or rejection. */
export interface ChangeReview {
  /** The agent's working directory (`AgentSessionOptions.cwd`): deltabox's session view of the document directory, or (git) the document directory itself. */
  readonly root: string
  /** `immediate`: changes are in the document directory before the review (the preview follows them); `on-commit`: written there on acceptance only. */
  readonly visibility: 'immediate' | 'on-commit'
  /** Records a checkpoint and returns the changes since the previous one; the assistant calls it when each tool call completes (at most 100, later ones join the last step). */
  step(label: string, tool?: string): Promise<ReviewStep>
  steps(): readonly ReviewStep[]
  /** The changes of the whole task against the snapshot taken when it started. */
  diff(): Promise<ReviewChange[]>
  /**
   * Back to before a step (P-115): the document directory as it was at the
   * checkpoint before `stepId` (the snapshot for the first step); that step
   * and the later ones are dropped from `steps()`. The review goes on. Optional:
   * a review without it offers no return to a step.
   */
  restoreTo?(stepId: string): Promise<void>
  /**
   * Accept: the changes stay in (with `on-commit`, are written to) the
   * document directory and the review ends; the files of `reject` go back to
   * the snapshot taken when the task started, those not in it (the task
   * created them) are deleted. Returns the files left changed, for `REVISIONS.commit`.
   */
  accept(reject?: string[]): Promise<string[]>
  /** Reject all: back to the state when the task started, files the task created deleted; the review ends. */
  rollback(): Promise<void>
  /** Frees its resources; equals `rollback()` while not accepted. */
  close(): Promise<void>
}

export interface ChangeReviewService {
  /** The implementation's name, which the UI shows, e.g. `deltabox` (the git implementation is the assistant's own, not behind this token). */
  readonly engine: string
  /** Starts the review of a change task and records the snapshot of its start; at most one per document directory at a time. */
  open(options: { document: string, task: string, member: Member }): Promise<ChangeReview>
}

/** Node service: `addon-deltabox` registers it where the host qualifies (10.7). */
export const CHANGE_REVIEW = defineService<ChangeReviewService>('presmium.changeReview')

// Revision history (P-115, P-121) ----------------------------------------------------

export interface RevisionOrigin {
  kind: 'agent' | 'document' | 'editor'
  /** The agent task's id. */
  task?: string
  member?: Member
}

export interface Revision {
  /** The commit hash. */
  id: string
  message: string
  author: string
  /** ISO 8601. */
  date: string
  origin: RevisionOrigin
  /** Changed files, relative to the workspace root. */
  files: string[]
  /** The commit that reverted this change. */
  revertedBy?: string
}

export type RevertResult = { ok: true, revision: Revision } | { ok: false, conflicts: string[] }

export interface RevisionService {
  /** Commits the changes of these files as one commit (git hooks off); undefined when nothing changed. */
  commit(change: { files: string[], message: string, origin: RevisionOrigin }): Promise<Revision | undefined>
  history(filter?: { document?: string, task?: string, limit?: number }): Promise<Revision[]>
  /** `git revert`; on conflicts nothing is committed, the work tree is restored and the conflicting files returned. */
  revert(id: string, member: Member): Promise<RevertResult>
}

export const REVISIONS = defineService<RevisionService>('presmium.revisions')

// Locks of documents (F-09) -----------------------------------------------------------

/**
 * One writer of a document at a time: a document operation (rename, copy,
 * delete), an undo of the history, or an agent's change task. A holder names
 * itself, e.g. `agent:<task id>` or `document:rename`.
 */
export interface DocumentLockService {
  /** Takes the document's lock for `holder`: the function that releases it, or undefined while another holds it. */
  claim(document: string, holder: string): (() => void) | undefined
  /** Who holds the document's lock; undefined when no one does. */
  holder(document: string): string | undefined
}

/**
 * Node service: `presmium serve` and `presmium dev` provide it (the
 * workspace), and the document operations, the history's undo, the source
 * editor's saves and the assistant's change tasks take their locks through
 * it. In `presmium dev` the plugins name the deck '' (its document). Without
 * it, the assistant keeps its own.
 */
export const DOCUMENT_LOCKS = defineService<DocumentLockService>('presmium.documentLocks')

// Writing a document's files (WP-91) --------------------------------------------------

/**
 * A file of a document directory as it is to be: its content, a symbolic
 * link, or gone. Paths are relative to the workspace root. With `at`, the
 * content is written at that byte position of the file, whose other bytes
 * stay (a recording uploaded in pieces); the file is made when it is not
 * there, and a link in its place is replaced by an empty file first.
 */
export type DocumentFileChange =
  | { path: string, content: Uint8Array, executable?: boolean, at?: number }
  | { path: string, link: string }
  | { path: string, remove: true }

/**
 * Writes files of document directories (docs/architecture.md 10.7, WP-91):
 * the workspace's one way to change them, in this process. Every path lies in a document directory; a
 * symbolic link on the way is replaced, never followed; directories a
 * removal leaves empty go, up to the document directory.
 */
export interface DocumentFiles {
  write(changes: DocumentFileChange[]): Promise<void>
}

/**
 * Node service: the workspace registers it in `presmium serve` and
 * `presmium dev` (not for a deck git ignores inside another repository, whose
 * workspace root is not the editor's). Plugins write the files of their deck
 * through it when the host has it (`ServerContext.service`,
 * `NodeServiceContext.service`, `PassContext.service`), and in this process
 * only without it (`presmium build`, and the decks above).
 */
export const DOCUMENT_FILES = defineService<DocumentFiles>('presmium.documentFiles')
