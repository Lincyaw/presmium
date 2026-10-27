import type { CanonicalSource } from '../ir.ts'
import type { DocumentEditOperation, DocumentIssue, TeachingDocument } from './document.ts'
import type { Member } from './server.ts'
import type { DocumentAnswer, DocumentChange, DocumentChangeAnswer } from './workspace.ts'

export const AUTHORING_API_VERSION = 1 as const
export const DOCUMENT_OPERATION_TYPES = ['insertBlock', 'moveBlock', 'deleteBlock', 'updateText', 'updateSection', 'setStepState', 'setNarration', 'setTiming', 'replaceAsset'] as const satisfies readonly DocumentEditOperation['type'][]

export interface AuthoringCapabilities {
  apiVersion: typeof AUTHORING_API_VERSION
  documentSchemaVersion: number
  available: boolean
  reason?: 'host-unavailable' | 'permission-denied'
  actions: { read: boolean, plan: boolean, apply: boolean, planPageDuplication: boolean, applyPageDuplication: boolean }
  applyUnavailableReason?: 'review-required' | 'operation-disabled'
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
export interface AppliedDocumentChange extends DocumentChangeAnswer {
  verification: { saved: true, source: CanonicalSource, compiled: 'not-requested', runtime: 'not-requested' }
}

/** Injected by an authoring host. Neither MCP nor compilation owns file-writing semantics. */
export interface DocumentAuthoring {
  capabilities(document: string, member: Member): AuthoringCapabilities
  read(document: string, member: Member): Promise<DocumentAnswer>
  plan(document: string, change: DocumentChange, member: Member): Promise<DocumentChangePlan>
  planPageDuplication(document: string, request: DocumentPageDuplicationRequest, member: Member): Promise<DocumentPageDuplicationPlan>
  readPageDuplicationPlan(document: string, reference: DocumentPageDuplicationRead, member: Member): Promise<DocumentPageDuplicationInspection>
  applyPageDuplication(document: string, reference: DocumentPageDuplicationReference, member: Member): Promise<AppliedDocumentPageDuplication>
  apply(document: string, request: ApplyDocumentChange, member: Member): Promise<AppliedDocumentChange>
}

export interface AuthoringFailure {
  code: string
  message: string
  status: number
  retryable: boolean
  detail?: Record<string, unknown>
}
