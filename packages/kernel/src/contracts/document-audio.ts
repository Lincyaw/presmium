import type { CanonicalSource } from '../ir.ts'
import type { Finding } from './checks.ts'
import type { DocumentIssue, MediaClip } from './document.ts'
import { DOCUMENT_AUDIO_MAX_BYTES } from './production-assets.ts'
import type { DocumentAudioImportAnswer, DocumentAudioInspectionAnswer, ProductionAssetInspection, ProductionAudioPlanQuery } from './production-assets.ts'
import type { ProductionBinding, ProductionPlan } from './production.ts'
import type { Member } from './server.ts'
import type { DocumentChangeAnswer } from './workspace.ts'

export const DOCUMENT_AUDIO_REQUEST_MAX_BYTES = 16 << 10

export interface DocumentAudioCapabilities {
  source: CanonicalSource
  available: boolean
  status: 'available' | 'unavailable' | 'unknown'
  reason?: 'audio-unavailable' | 'services-unavailable'
  verification: 'configuration-only'
  findings?: Finding[]
  actions: { inspect: boolean, inspectWorkspace: boolean, importWorkspace: boolean, readProductionPlan: boolean, validateClipChange: boolean, changeClip: boolean, adoptRecording: boolean }
  importUnavailableReason?: 'review-required' | 'operation-disabled'
  clipChangeUnavailableReason?: 'review-required' | 'operation-disabled'
  clips: { upsert: boolean, remove: true, upsertRequires: 'current-production-binding' }
  limits: { audioBytes: number, requestBytes: number, receipts: number, concurrent: number }
  workspaceFileScope: 'same-document'
  idempotency: 'process-current-source'
  review: 'required-unsupported' | 'locks-and-history' | 'locks-only'
}
export interface DocumentAudioInspect { source: CanonicalSource, assetId: string }
/** Explicit whole-file narration adoption. Does not edit narration text, cues or media clips. */
export interface DocumentRecordingAdoption { id: string, source: CanonicalSource, stepId: string, assetId: string, sha256: string }
export interface VerifiedDocumentRecordingAdoption extends DocumentChangeAnswer {
  verification: { saved: true, source: CanonicalSource, stepId: string, assetId: string, sha256: string, durationMs: number, compiled: 'not-requested', runtime: 'not-requested' }
}
/** Inspect an existing real snapshot; an expected revision is optional during discovery. */
export type DocProductionPlanQuery = ProductionAudioPlanQuery
export interface DocumentWorkspaceAudioInspect { source: CanonicalSource, path: string }
export interface WorkspaceAudioInspectionAnswer {
  document: string
  source: CanonicalSource
  file: { path: string, sha256: string, byteLength: number }
  inspection: Omit<ProductionAssetInspection, 'assetId' | 'mediaId'>
}
export interface DocumentWorkspaceAudioImport {
  id: string
  source: CanonicalSource
  /** Workspace-relative regular file permitted by the selected document's existing source scope. */
  file: { path: string, sha256: string, byteLength: number }
}
export interface VerifiedDocumentAudioImport extends DocumentAudioImportAnswer {
  verification: {
    saved: true
    source: CanonicalSource
    asset: { assetId: string, path: string, sha256: string, byteLength: number }
    compiled: 'not-requested'
    runtime: 'not-requested'
  }
}
/** A repeatable check against saved content; no plan or write intent is retained. */
export type DocumentMediaClipValidation =
  | { source: CanonicalSource, binding: ProductionBinding, clip: MediaClip }
  | { source: CanonicalSource, removeClipId: string }
export type DocumentMediaClipEdit = DocumentMediaClipValidation & { id: string }
export interface DocumentMediaClipValidationAnswer {
  document: string
  source: CanonicalSource
  operation: 'add' | 'update' | 'remove'
  clipId: string
  before?: MediaClip
  after?: MediaClip
  impact: { stepIds: string[], assetIds: string[] }
  issues: DocumentIssue[]
  checked: { canonical: true, production: 'validated' | 'not-required', binding?: ProductionBinding }
}
export interface VerifiedDocumentMediaClipChange extends DocumentChangeAnswer {
  verification: {
    saved: true
    source: CanonicalSource
    production: 'validated-before-save' | 'not-required'
    binding?: ProductionBinding
    compiled: 'not-requested'
    runtime: 'not-requested'
  }
}
/** Workspace authoring boundary, distinct from the plugin's low-level ProductionAudioAuthoring. */
export interface DocumentAudioAuthoring {
  capabilities(document: string, member: Member): Promise<DocumentAudioCapabilities>
  inspect(document: string, request: DocumentAudioInspect, member: Member, signal?: AbortSignal): Promise<DocumentAudioInspectionAnswer>
  inspectWorkspace(document: string, request: DocumentWorkspaceAudioInspect, member: Member, signal?: AbortSignal): Promise<WorkspaceAudioInspectionAnswer>
  readProductionPlan(document: string, request: DocProductionPlanQuery, member: Member, signal?: AbortSignal): Promise<ProductionPlan>
  /** Agent entry. Origin and required review come from the host, never from this request. */
  importWorkspace(document: string, request: DocumentWorkspaceAudioImport, member: Member, signal?: AbortSignal): Promise<VerifiedDocumentAudioImport>
  validateClipChange(document: string, request: DocumentMediaClipValidation, member: Member, signal?: AbortSignal): Promise<DocumentMediaClipValidationAnswer>
  /** Agent entry; the transaction rechecks source, real media and current production timing. */
  changeClip(document: string, request: DocumentMediaClipEdit, member: Member, signal?: AbortSignal): Promise<VerifiedDocumentMediaClipChange>
  adoptRecording(document: string, request: DocumentRecordingAdoption, member: Member, signal?: AbortSignal): Promise<VerifiedDocumentRecordingAdoption>
}

const source = { type: 'object', additionalProperties: false, properties: { documentId: { type: 'string', minLength: 1, maxLength: 200 }, version: { type: 'string', pattern: '^[a-f\\d]{20}$' }, fingerprint: { type: 'string', pattern: '^[a-f\\d]{16}$' } }, required: ['documentId', 'version', 'fingerprint'] } as const
export const DOCUMENT_AUDIO_INSPECTION_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: { source, assetId: { type: 'string', minLength: 1, maxLength: 200 } },
  required: ['source', 'assetId'],
} as const
export const DOCUMENT_RECORDING_ADOPTION_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: { id: { type: 'string', minLength: 1, maxLength: 200 }, source, stepId: { type: 'string', minLength: 1, maxLength: 200 }, assetId: { type: 'string', minLength: 1, maxLength: 200 }, sha256: { type: 'string', pattern: '^[a-f\\d]{64}$' } },
  required: ['id', 'source', 'stepId', 'assetId', 'sha256'],
} as const
export const DOCUMENT_AUDIO_WORKSPACE_IMPORT_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    id: { type: 'string', minLength: 1, maxLength: 200 }, source,
    file: { type: 'object', additionalProperties: false, properties: { path: { type: 'string', minLength: 1, maxLength: 1024 }, sha256: { type: 'string', pattern: '^[a-f\\d]{64}$' }, byteLength: { type: 'integer', minimum: 1, maximum: DOCUMENT_AUDIO_MAX_BYTES } }, required: ['path', 'sha256', 'byteLength'] },
  },
  required: ['id', 'source', 'file'],
} as const

export const DOCUMENT_WORKSPACE_AUDIO_INSPECTION_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: { source, path: { type: 'string', minLength: 1, maxLength: 1024 } },
  required: ['source', 'path'],
} as const

const clipId = { type: 'string', minLength: 1, maxLength: 200, pattern: '^[^\\u0000-\\u001f]+$', not: { enum: ['__proto__', 'constructor', 'prototype'] } } as const
const clip = {
  type: 'object', additionalProperties: false,
  properties: {
    id: clipId, assetId: clipId,
    sourceRange: { type: 'object', additionalProperties: false, properties: { startMs: { type: 'number', minimum: 0 }, endMs: { type: 'number', minimum: 0 } }, required: ['startMs', 'endMs'] },
    attachment: { type: 'object', additionalProperties: false, properties: { stepId: clipId, offsetMs: { type: 'number', minimum: 0 } }, required: ['stepId', 'offsetMs'] },
    volume: { type: 'number', minimum: 0, maximum: 1 }, muted: { type: 'boolean' },
  },
  required: ['id', 'assetId', 'sourceRange', 'attachment', 'volume'],
} as const
const productionBinding = { type: 'object', additionalProperties: false, properties: { source, irRevision: { type: 'string', pattern: '^[a-f\\d]{16}$' }, planId: { type: 'string', pattern: '^[a-f\\d]{32}$' } }, required: ['source', 'irRevision', 'planId'] } as const
export const DOCUMENT_PRODUCTION_PLAN_SCHEMA = { type: 'object', additionalProperties: false, properties: { source, irRevision: productionBinding.properties.irRevision }, required: ['source'] } as const
const clipRequestSchema = (edit: boolean) => ({
  oneOf: [
    { type: 'object', additionalProperties: false, properties: { ...edit ? { id: clipId } : {}, source, binding: productionBinding, clip }, required: [...edit ? ['id'] : [], 'source', 'binding', 'clip'] },
    { type: 'object', additionalProperties: false, properties: { ...edit ? { id: clipId } : {}, source, removeClipId: clipId }, required: [...edit ? ['id'] : [], 'source', 'removeClipId'] },
  ],
})
export const DOCUMENT_MEDIA_CLIP_VALIDATION_SCHEMA = /* @__PURE__ */ clipRequestSchema(false)
export const DOCUMENT_MEDIA_CLIP_CHANGE_SCHEMA = /* @__PURE__ */ clipRequestSchema(true)
