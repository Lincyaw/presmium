import type { Member } from './server.ts'
import type { ReviewChange, ReviewStep } from './workspace.ts'

export const WORKSPACE_REVIEW_MAX_REQUEST_CHARS = 8192
export const WORKSPACE_REVIEW_MAX_RESPONSE_CHARS = 7168
export const WORKSPACE_REVIEW_FRAGMENT_CHARS = 4000
export interface WorkspaceReviewQuery { part?: 'summary' | 'files' | 'steps' | 'diff', path?: string, step?: string, offset?: number, snapshot?: string }
export interface WorkspaceReviewSummary { id: string, document: string, running: boolean, mode: 'required' | 'auto', files: number, steps: number }
export interface WorkspaceReviewAnswer {
  review: WorkspaceReviewSummary | null
  snapshot?: string
  files?: Omit<ReviewChange, 'diff'>[]
  steps?: (Omit<ReviewStep, 'changes'> & { files: number })[]
  nextOffset?: number
  diff?: { path: string, step?: string, text: string, offset: number, totalChars: number, sha256: string }
}
export type WorkspaceReviewChange =
  | { action: 'accept', snapshot: string, reject?: string[], message?: string }
  | { action: 'reject', snapshot: string, paths?: string[], confirm: true }
  | { action: 'restore', snapshot: string, step: string, confirm: true }
export interface WorkspaceReviewChanged { outcome: 'accepted' | 'rejected' | 'restored' | 'updated' | 'empty', revision?: string, files?: number, remainingFiles?: number }
/** Workspace publication authority; document-scoped agent credentials must never receive this service. */
export interface WorkspaceReview {
  read(query: WorkspaceReviewQuery, member: Member): Promise<WorkspaceReviewAnswer>
  check(change: WorkspaceReviewChange, member: Member): Promise<void>
  change(change: WorkspaceReviewChange, member: Member, signal?: AbortSignal): Promise<WorkspaceReviewChanged>
}
const path = { type: 'string', minLength: 1, maxLength: 500 } as const
const snapshot = { type: 'string', pattern: '^[a-f0-9]{64}$' } as const
const step = { type: 'string', minLength: 1, maxLength: 100 } as const
const paths = { type: 'array', minItems: 1, maxItems: 200, uniqueItems: true, items: path } as const
export const WORKSPACE_REVIEW_QUERY_SCHEMA = { type: 'object', additionalProperties: false, properties: {
  part: { enum: ['summary', 'files', 'steps', 'diff'] }, path, step, offset: { type: 'integer', minimum: 0 }, snapshot,
} } as const
export const WORKSPACE_REVIEW_CHANGE_SCHEMA = { oneOf: [
  { type: 'object', additionalProperties: false, required: ['action', 'snapshot'], properties: { action: { const: 'accept' }, snapshot, reject: paths, message: { type: 'string', minLength: 1, maxLength: 4000 } } },
  { type: 'object', additionalProperties: false, required: ['action', 'snapshot', 'confirm'], properties: { action: { const: 'reject' }, snapshot, paths, confirm: { const: true } } },
  { type: 'object', additionalProperties: false, required: ['action', 'snapshot', 'step', 'confirm'], properties: { action: { const: 'restore' }, snapshot, step, confirm: { const: true } } },
] } as const
