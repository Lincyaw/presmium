import type { CanonicalSource } from '../ir.ts'
import type { Finding } from './checks.ts'
import { DOCUMENT_AUDIO_MAX_BYTES } from './production-assets.ts'
import type { DocumentAudioImportAnswer, DocumentAudioInspectionAnswer, ProductionAssetInspection } from './production-assets.ts'
import type { Member } from './server.ts'

export const DOCUMENT_AUDIO_REQUEST_MAX_BYTES = 16 << 10

export interface DocumentAudioCapabilities {
  source: CanonicalSource
  available: boolean
  status: 'available' | 'unavailable' | 'unknown'
  reason?: 'audio-unavailable' | 'services-unavailable'
  verification: 'configuration-only'
  findings?: Finding[]
  actions: { inspect: boolean, inspectWorkspace: boolean, importWorkspace: boolean }
  importUnavailableReason?: 'review-required' | 'operation-disabled'
  limits: { audioBytes: number, requestBytes: number, receipts: number, concurrent: number }
  workspaceFileScope: 'same-document'
  idempotency: 'process-current-source'
  review: 'required-unsupported' | 'locks-and-history' | 'locks-only'
}
export interface DocumentAudioInspect { source: CanonicalSource, assetId: string }
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
/** Workspace authoring boundary, distinct from the plugin's low-level ProductionAudioAuthoring. */
export interface DocumentAudioAuthoring {
  capabilities(document: string, member: Member): Promise<DocumentAudioCapabilities>
  inspect(document: string, request: DocumentAudioInspect, member: Member, signal?: AbortSignal): Promise<DocumentAudioInspectionAnswer>
  inspectWorkspace(document: string, request: DocumentWorkspaceAudioInspect, member: Member, signal?: AbortSignal): Promise<WorkspaceAudioInspectionAnswer>
  /** Agent entry. Origin and required review come from the host, never from this request. */
  importWorkspace(document: string, request: DocumentWorkspaceAudioImport, member: Member, signal?: AbortSignal): Promise<VerifiedDocumentAudioImport>
}

const source = { type: 'object', additionalProperties: false, properties: { documentId: { type: 'string', minLength: 1, maxLength: 200 }, version: { type: 'string', pattern: '^[a-f\\d]{20}$' }, fingerprint: { type: 'string', pattern: '^[a-f\\d]{16}$' } }, required: ['documentId', 'version', 'fingerprint'] } as const
export const DOCUMENT_AUDIO_INSPECTION_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: { source, assetId: { type: 'string', minLength: 1, maxLength: 200 } },
  required: ['source', 'assetId'],
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
