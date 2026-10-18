import type { ApprovalRequest, McpAccess, Member } from './server.ts'
import { defineService } from './service.ts'
import type { ServiceToken } from './service.ts'

export interface SourceRange { file: string, startLine: number, endLine: number }

/** @experimental */
export interface Focus {
  id: string
  from: 'source' | 'web' | 'slides'
  document: string
  source: SourceRange
  excerpt: string
  section?: string
  block?: string
  step?: number
  quote?: string
}

/** @experimental */
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
  document: string
  section?: string
  step?: number
  block?: string
  view?: string
  selection?: string
  source?: SourceRange
  focus?: Focus[]
}

export type AgentTaskKind = 'annotations' | 'chat' | 'transcript'

export type AnnotationStatus = 'draft' | 'sent' | 'done' | 'failed'

export interface Annotation {
  id: string
  section: string
  block: string
  source: SourceRange
  excerpt: string
  request: string
  status: AnnotationStatus
  note?: string
  focus?: Focus
}

export interface AgentTaskRequest {
  kind: AgentTaskKind
  prompt: string
  context: AgentContext
  annotations?: Annotation[]
  track?: string
}

export interface Citation {
  label: string
  section: string
  step?: number
  block?: string
}

export type AgentEvent =
  | { type: 'progress', text: string, tool?: string, call?: string, status?: 'running' | 'completed' | 'failed' }
  | { type: 'message', text: string, citations?: Citation[] }
  | { type: 'approval', id: string, request: ApprovalRequest }
  | { type: 'annotation', id: string, status: AnnotationStatus, note?: string }
  | { type: 'step', step: ReviewStep }
  | { type: 'review', engine: string, changes: ReviewChange[], steps: ReviewStep[] }
  | { type: 'done', revision?: string }
  | { type: 'error', message: string }

/** @experimental */
export type ReviewDecision =
  | { accept: true, reject?: string[] }
  | { accept: false }

/** @experimental */
export interface AgentTask {
  readonly id: string
  readonly events: AsyncIterable<AgentEvent>
  cancel(): void
  review(decision: ReviewDecision): Promise<void>
  revert(): Promise<TaskRevertResult>
}

/** @experimental */
export type TaskRevertResult = { ok: true, revision: string } | { ok: false, conflicts: string[] }

/** @experimental */
export interface AgentClient {
  available(kind: AgentTaskKind): boolean
  provider(): string | undefined
  runtime(): string | undefined
  submit(request: AgentTaskRequest): AgentTask
}

/** @experimental */
export const AGENT = defineService<AgentClient>('presmium.agent')

export interface AskClient {
  provider(): string | undefined
  ask(question: string, context: AgentContext, signal?: AbortSignal): AsyncIterable<string>
}

export const ASK = defineService<AskClient>('presmium.ask')

export interface AgentSessionOptions {
  cwd: string
  member: Member
  mcp?: McpAccess
  approve(request: ApprovalRequest): Promise<boolean>
}

export interface AgentSession {
  prompt(request: AgentTaskRequest, signal?: AbortSignal): AsyncIterable<AgentEvent>
  cancel(): Promise<void>
  close(): Promise<void>
}

export interface AgentRuntime {
  readonly provider: string | undefined
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
  name: string
  description: string
  input: Record<string, unknown>
  kind: AgentToolKind
  run(input: Record<string, unknown>, ctx: AgentToolContext): Promise<unknown>
}

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
