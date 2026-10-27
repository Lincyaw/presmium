import type { CanonicalSource } from '../ir.ts'
import type { DocumentEditOperation, DocumentIssue, TeachingDocument } from './document.ts'
import type { Member } from './server.ts'
import type { DocumentAnswer, DocumentChange, DocumentChangeAnswer, RevisionOrigin } from './workspace.ts'
import type { DocumentOutlineAnswer, DocumentOutlineQuery, DocumentPartAnswer, DocumentPartQuery } from './document-reads.ts'
import type { AppliedDocumentAuthoringAction, DocumentAuthoringActionInspection, DocumentAuthoringActionPlan, DocumentAuthoringActionRead, DocumentAuthoringActionReference, DocumentAuthoringActionRequest, DocumentAuthoringAction } from './authoring-actions.ts'

export const AUTHORING_API_VERSION = 1 as const
export const DOCUMENT_OPERATION_TYPES = ['insertBlock', 'moveBlock', 'deleteBlock', 'updateText', 'updateSection', 'setStepState', 'setNarration', 'setTiming', 'replaceAsset'] as const satisfies readonly DocumentEditOperation['type'][]

export interface AuthoringCapabilities {
  apiVersion: typeof AUTHORING_API_VERSION
  documentSchemaVersion: number
  available: boolean
  reason?: 'host-unavailable' | 'permission-denied'
  actions: { read: boolean, outline: boolean, readPart: boolean, plan: boolean, apply: boolean, planPageDuplication: boolean, applyPageDuplication: boolean, planPageChange: boolean, applyPageChange: boolean, planAction: boolean, applyAction: boolean }
  applyUnavailableReason?: 'review-required' | 'operation-disabled'
  readLimits?: { maxRequestChars: number, maxResponseChars: number, responseSerialization: 'JSON.stringify(value,null,2)', offsetUnit: 'utf16' }
  pageLimits?: { maxRequestChars: number, maxResponseChars: number, responseSerialization: 'JSON.stringify(value,null,2)' }
  actionLimits?: { maxRequestChars: number, maxResponseChars: number, responseSerialization: 'JSON.stringify(value,null,2)' }
  semanticActions?: readonly DocumentAuthoringAction['type'][]
  operations: readonly DocumentEditOperation['type'][]
  replacement: boolean
  fileChanges: boolean
  limits?: { maxFiles: number, maxTextBytes: number, maxOperations: number, planLifetimeMs: number, maxPlans: number, maxReceipts: number }
  idempotency: 'process-current-source' | 'unavailable'
  review: 'required-unsupported' | 'locks-and-history' | 'locks-only' | 'unavailable'
}

/** A pure local preflight. Files include lecture.json and their predicted post-save versions. */
export interface DocumentChangePlan {
  apiVersion: typeof AUTHORING_API_VERSION
  planId: string
  changeId: string
  document: string
  source: CanonicalSource
  digest: string
  expiresAt: string
  content: TeachingDocument
  issues: DocumentIssue[]
  files: { path: string, base: string | null, version: string }[]
  impact: { sections: string[], blocks: string[], steps: string[], narrations: string[], assets: string[], definitions: string[], sectionOrder: boolean, production: boolean, comments: boolean, metadata: boolean }
}

export interface ApplyDocumentChange { change: DocumentChange, planId: string }
export interface DocumentPageDuplicationRequest { id: string, source: CanonicalSource, sectionId: string, title: string }
export type DocumentPageAction =
  | { type: 'create', title: string, after?: string | null }
  | { type: 'rename', sectionId: string, title: string }
  | { type: 'move', sectionId: string, before: string | null }
  | { type: 'delete', sectionId: string }
export interface DocumentPageIds { sectionId: string, blockId: string, nodeId: string, stepId: string }
export interface DocumentPageDeletionImpact {
  sectionId: string
  retainedEmpty: boolean
  blocks: string[]
  steps: string[]
  narrations: string[]
  retainedNarrations: string[]
  cues: string[]
  clips: string[]
  detachedComments: string[]
  references: ({ type: 'cue', narrationId: string, cueId: string, blockId: string, stepIds: string[] } | { type: 'inheritance', stepId: string, inheritedStepId: string })[]
}
export interface DocumentPageChangeRequest { id: string, source: CanonicalSource, action: DocumentPageAction }
export interface DocumentPageChangePlan extends DocumentChangePlan {
  action: DocumentPageAction
  sectionId: string
  created?: DocumentPageIds
  deletion?: DocumentPageDeletionImpact
  change: DocumentChange
}
export interface DocumentPageChangeReference extends DocumentPageDuplicationReference { confirmDeletion?: true }
export interface DocumentPageChangeInspection { plan: DocumentPageChangePlan, currentSource: CanonicalSource, state: 'current' | 'applied' | 'old' }
export interface AppliedDocumentPageChange extends Omit<AppliedDocumentChange, 'content' | 'issues' | 'verification' | 'commit'> {
  commit?: { id: string, origin: RevisionOrigin['kind'] }
  planId: string
  digest: string
  action: DocumentPageAction['type']
  sectionId: string
  retainedEmpty: boolean
  changed: boolean
  impact: Record<keyof DocumentChangePlan['impact'], number | boolean>
  verification: AppliedDocumentChange['verification'] & { plannedVersion: string, pageStateVerified: true }
}
export interface DocumentPageDuplicationPlan extends DocumentChangePlan {
  action: 'duplicatePage'
  section: { from: string, to: string }
  /** Only copied declared identities; assets, definitions, opaque payloads and comments retain their references. */
  mapping: Record<string, string>
  /** Pass this exact candidate with planId to the existing apply operation. */
  change: DocumentChange
}
export interface DocumentPageDuplicationReference { planId: string, source: CanonicalSource, digest: string }
export interface DocumentPageDuplicationRead { planId: string, digest: string }
export interface DocumentPageDuplicationInspection {
  plan: DocumentPageDuplicationPlan
  currentSource: CanonicalSource
  state: 'current' | 'applied' | 'old'
}
export interface AppliedDocumentPageDuplication extends Omit<AppliedDocumentChange, 'content' | 'issues' | 'verification'> {
  planId: string
  digest: string
  section: DocumentPageDuplicationPlan['section']
  copied: { identities: number, sections: number, blocks: number, steps: number, narrations: number }
  verification: AppliedDocumentChange['verification'] & { plannedVersion: string, pagePresent: true }
}
export const DOCUMENT_PAGE_DUPLICATION_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['id', 'source', 'sectionId', 'title'],
  properties: {
    id: { type: 'string', minLength: 1, maxLength: 200 },
    source: { type: 'object', additionalProperties: false, required: ['documentId', 'version', 'fingerprint'], properties: {
      documentId: { type: 'string', minLength: 1, maxLength: 200 }, version: { type: 'string', minLength: 1, maxLength: 128 }, fingerprint: { type: 'string', minLength: 1, maxLength: 128 },
    } },
    sectionId: { type: 'string', minLength: 1, maxLength: 200 }, title: { type: 'string', minLength: 1, maxLength: 1000 },
  },
} as const
export const DOCUMENT_PAGE_DUPLICATION_APPLY_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['planId', 'source', 'digest'], properties: {
    planId: { type: 'string', minLength: 1, maxLength: 200 },
    source: DOCUMENT_PAGE_DUPLICATION_SCHEMA.properties.source,
    digest: { type: 'string', pattern: '^[a-f0-9]{64}$' },
  },
} as const
export const DOCUMENT_PAGE_CHANGE_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['id', 'source', 'action'], properties: {
    id: DOCUMENT_PAGE_DUPLICATION_SCHEMA.properties.id,
    source: DOCUMENT_PAGE_DUPLICATION_SCHEMA.properties.source,
    action: { oneOf: [
      { type: 'object', additionalProperties: false, required: ['type', 'title'], properties: { type: { const: 'create' }, title: DOCUMENT_PAGE_DUPLICATION_SCHEMA.properties.title, after: { type: ['string', 'null'], minLength: 1, maxLength: 200 } } },
      { type: 'object', additionalProperties: false, required: ['type', 'sectionId', 'title'], properties: { type: { const: 'rename' }, sectionId: DOCUMENT_PAGE_DUPLICATION_SCHEMA.properties.sectionId, title: DOCUMENT_PAGE_DUPLICATION_SCHEMA.properties.title } },
      { type: 'object', additionalProperties: false, required: ['type', 'sectionId', 'before'], properties: { type: { const: 'move' }, sectionId: DOCUMENT_PAGE_DUPLICATION_SCHEMA.properties.sectionId, before: { type: ['string', 'null'], minLength: 1, maxLength: 200 } } },
      { type: 'object', additionalProperties: false, required: ['type', 'sectionId'], properties: { type: { const: 'delete' }, sectionId: DOCUMENT_PAGE_DUPLICATION_SCHEMA.properties.sectionId } },
    ] },
  },
} as const
export const DOCUMENT_PAGE_CHANGE_APPLY_SCHEMA = {
  ...DOCUMENT_PAGE_DUPLICATION_APPLY_SCHEMA,
  properties: { ...DOCUMENT_PAGE_DUPLICATION_APPLY_SCHEMA.properties, confirmDeletion: { const: true } },
} as const
export interface AppliedDocumentChange extends DocumentChangeAnswer {
  verification: { saved: true, source: CanonicalSource, compiled: 'not-requested', runtime: 'not-requested' }
}

/** Injected by an authoring host. Neither MCP nor compilation owns file-writing semantics. */
export interface DocumentAuthoring {
  capabilities(document: string, member: Member): AuthoringCapabilities
  read(document: string, member: Member): Promise<DocumentAnswer>
  outline(document: string, query: DocumentOutlineQuery, member: Member): Promise<DocumentOutlineAnswer>
  readPart(document: string, query: DocumentPartQuery, member: Member): Promise<DocumentPartAnswer>
  plan(document: string, change: DocumentChange, member: Member): Promise<DocumentChangePlan>
  planPageDuplication(document: string, request: DocumentPageDuplicationRequest, member: Member): Promise<DocumentPageDuplicationPlan>
  readPageDuplicationPlan(document: string, reference: DocumentPageDuplicationRead, member: Member): Promise<DocumentPageDuplicationInspection>
  applyPageDuplication(document: string, reference: DocumentPageDuplicationReference, member: Member): Promise<AppliedDocumentPageDuplication>
  planPageChange(document: string, request: DocumentPageChangeRequest, member: Member): Promise<DocumentPageChangePlan>
  readPageChangePlan(document: string, reference: DocumentPageDuplicationRead, member: Member): Promise<DocumentPageChangeInspection>
  applyPageChange(document: string, reference: DocumentPageChangeReference, member: Member): Promise<AppliedDocumentPageChange>
  planAction(document: string, request: DocumentAuthoringActionRequest, member: Member): Promise<DocumentAuthoringActionPlan>
  readActionPlan(document: string, reference: DocumentAuthoringActionRead, member: Member): Promise<DocumentAuthoringActionInspection>
  applyAction(document: string, reference: DocumentAuthoringActionReference, member: Member): Promise<AppliedDocumentAuthoringAction>
  apply(document: string, request: ApplyDocumentChange, member: Member): Promise<AppliedDocumentChange>
}

export interface AuthoringFailure {
  code: string
  message: string
  status: number
  retryable: boolean
  detail?: Record<string, unknown>
}
