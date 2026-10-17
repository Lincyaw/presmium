/**
 * Agents (P-110 to P-114, P-136), change review (D12) and revision history
 * (P-115, P-121); docs/architecture.md 4.8 and 10.7.
 */
import type { AgentMode, ApprovalRequest, GatewayAccess, McpAccess, Member } from './server.ts'
import { defineService } from './service.ts'
import type { ServiceToken } from './service.ts'

export interface SourceRange { file: string, startLine: number, endLine: number }

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
}

/**
 * `question` reads only; the others are change tasks (`chat` also drafts new
 * documents), which the assistant handles by one rule: one task per
 * document, one commit through `REVISIONS` at its end, revertible, writes out
 * of scope confirmed.
 */
export type AgentTaskKind = 'question' | 'annotations' | 'chat' | 'transcript'

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
}

export interface AgentTaskRequest {
  kind: AgentTaskKind
  /** The question, the chat message or the overall request. */
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

/** The requester's decision on a change task. */
export type ReviewDecision =
  /** Accept; the files of `reject` (relative to the workspace root) go back to their content when the task started, files the task created are deleted. */
  | { accept: true, reject?: string[] }
  /** Reject all: back to the state when the task started. */
  | { accept: false }

export interface AgentTask {
  readonly id: string
  readonly events: AsyncIterable<AgentEvent>
  cancel(): void
  /** Answers the `review` event; only the member who started the task and owners may. */
  review(decision: ReviewDecision): Promise<void>
}

/** In the browser: a page submits tasks to the server's assistant. */
export interface AgentClient {
  /** The server has an agent runtime (the operator configured model access, or a replacement runtime) and the member may submit tasks of this kind. */
  available(kind: AgentTaskKind): boolean
  /** The model's service provider, e.g. `DeepSeek`, from the operator's settings; the question and chat panels show it (N-08). Undefined when unavailable. */
  provider(): string | undefined
  /** Name and version of the agent runtime (`AgentRuntime.runtime`), shown apart from the provider; undefined before the agent started. */
  runtime(): string | undefined
  submit(request: AgentTaskRequest): AgentTask
}

export const AGENT = defineService<AgentClient>('presmium.agent')

export interface AgentSessionOptions {
  /**
   * The `cwd` of ACP `session/new`, also the root the agent's file tools may
   * write: `ChangeReview.root` for a change task (the document directory, or
   * its deltabox view); the document directory for a question. Writing
   * outside it goes through the agent's permission request, of `workspace` scope.
   */
  cwd: string
  /** `author` may write the source; `tutor` reads only and has no operating tools. */
  mode: AgentMode
  member: Member
  /**
   * Presmium's MCP service, written to `mcpServers` of ACP `session/new`
   * (HTTP, with an `Authorization` header). The caller gets it from
   * `MCP_ENDPOINT.issue(member, mode)` and revokes it when the session
   * closes; omitted, the agent has no Presmium tools.
   */
  mcp?: McpAccess
  /**
   * SHARED mode: the model access, the gateway's Messages-compatible address
   * (`<gateway>/presmium.assistant/model`) and the scoped token serve issued
   * for this session; DeepSeek Harness gets them as `DEEPSEEK_BASE_URL` and
   * `DEEPSEEK_API_KEY` and never the model service's key. Omitted in LOCAL
   * mode: the runtime uses the model credentials the operator put in this
   * process's environment.
   */
  model?: GatewayAccess
  /** The agent's own permission requests (ACP `session/request_permission`) are confirmed through it. */
  approve(request: ApprovalRequest): Promise<boolean>
}

export interface AgentSession {
  prompt(request: AgentTaskRequest, signal?: AbortSignal): AsyncIterable<AgentEvent>
  cancel(): Promise<void>
  close(): Promise<void>
}

/** In Node: drives an agent; the one implementation is the ACP client (in SHARED mode, in serve, the agent-host client). */
export interface AgentRuntime {
  /**
   * The model's service provider, known before starting: for the bundled
   * DeepSeek Harness from the operator's model access (`DeepSeek` for
   * `DEEPSEEK_API_KEY`, or `PRESMIUM_MODEL_PROVIDER`; in SHARED mode the
   * gateway's); for a replacement runtime `settings.presmium.assistant.provider`
   * or `PRESMIUM_AGENT_PROVIDER`. Without one, `AGENT_RUNTIME` is not registered.
   */
  readonly provider: string
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

/** Node service: `addon-deltabox` registers it where the host qualifies; in SHARED mode, in serve, the agent-host client (10.7, 10.8). */
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
