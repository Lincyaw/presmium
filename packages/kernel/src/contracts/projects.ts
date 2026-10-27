import type { DocumentOperation, OperationAnswer } from './workspace.ts'
import type { Member } from './server.ts'

export const PROJECT_MAX_REQUEST_CHARS = 4096
export const PROJECT_MAX_RESPONSE_CHARS = 7168
export const PROJECT_MAX_PLANS = 64
export const PROJECT_PLAN_TTL_MS = 300_000
export type ProjectOperation = DocumentOperation | { op: 'retitle', dir: string, title: string }
export interface ProjectCaller { member: Member, origin: 'editor' | 'agent', boundDocument?: string }
export interface ProjectObservation { snapshot?: string, configuration: string }
export interface ProjectCapabilities {
  available: boolean
  reasons: string[]
  observation: ProjectObservation
  verification: 'configuration-only'
  rootDirectoryOperations: false
  limits: { requestChars: number, responseChars: number, backupEntries: number, backupBytes: number, plans: number, ttlMs: number }
}
export interface ProjectPlanRequest { id: string, operation: ProjectOperation }
export interface ProjectPlan {
  id: string
  planId: string
  digest: string
  operation: ProjectOperation
  observation: ProjectObservation
  tree: string
  documentId?: string
  expiresAt: string
  impact: { added: string[], removed: string[], files: number, bytes: number, referenceDocuments: string[], referencePolicy: 'preserve-or-refuse' }
}
export interface ProjectApply { planId: string, digest: string, confirmDeletion?: true }
export interface ProjectApplied extends OperationAnswer {
  id: string
  planId: string
  snapshot: string
  tree: string
  documentId?: string
  revisionTruncated?: true
  fileCount?: number
  verification: { saved: true, readback: 'verified', compiled: 'not-requested' }
}
/** Workspace management borrows the same directory writer, git queue and locks as Web. */
export interface ProjectAuthoring {
  capabilities(caller: ProjectCaller): Promise<ProjectCapabilities>
  plan(request: ProjectPlanRequest, caller: ProjectCaller): Promise<ProjectPlan>
  readPlan(request: ProjectApply, caller: ProjectCaller): Promise<ProjectPlan>
  apply(request: ProjectApply, caller: ProjectCaller, signal?: AbortSignal): Promise<ProjectApplied>
}
const text = { type: 'string', minLength: 1, maxLength: 200 } as const
const dir = { type: 'string', maxLength: 200 } as const
const operation = (op: string, properties: Record<string, unknown>, required: string[]) => ({ type: 'object', additionalProperties: false, properties: { op: { const: op }, dir, ...properties }, required: ['op', 'dir', ...required] })
export const PROJECT_PLAN_SCHEMA = { type: 'object', additionalProperties: false, required: ['id', 'operation'], properties: {
  id: text, operation: { oneOf: [operation('create', { title: text, template: text }, []), operation('copy', { to: text, title: text }, ['to']), operation('rename', { to: text }, ['to']), operation('delete', {}, []), operation('retitle', { title: text }, ['title'])] },
} } as const
export const PROJECT_APPLY_SCHEMA = { type: 'object', additionalProperties: false, required: ['planId', 'digest'], properties: { planId: text, digest: { type: 'string', pattern: '^[a-f0-9]{64}$' }, confirmDeletion: { const: true } } } as const
