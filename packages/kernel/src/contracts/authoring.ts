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
  actions: { read: boolean, plan: boolean, apply: boolean }
  applyUnavailableReason?: 'review-required' | 'operation-disabled'
  operations: readonly DocumentEditOperation['type'][]
  replacement: boolean
  fileChanges: boolean
  limits?: { maxFiles: number, maxTextBytes: number, maxOperations: number, planLifetimeMs: number }
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
export interface AppliedDocumentChange extends DocumentChangeAnswer {
  verification: { saved: true, source: CanonicalSource, compiled: 'not-requested', runtime: 'not-requested' }
}

/** Injected by an authoring host. Neither MCP nor compilation owns file-writing semantics. */
export interface DocumentAuthoring {
  capabilities(document: string, member: Member): AuthoringCapabilities
  read(document: string, member: Member): Promise<DocumentAnswer>
  plan(document: string, change: DocumentChange, member: Member): Promise<DocumentChangePlan>
  apply(document: string, request: ApplyDocumentChange, member: Member): Promise<AppliedDocumentChange>
}

export interface AuthoringFailure {
  code: string
  message: string
  status: number
  retryable: boolean
  detail?: Record<string, unknown>
}
