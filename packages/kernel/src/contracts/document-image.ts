import type { CanonicalSource } from '../ir.ts'
import type { Member } from './server.ts'
import type { DocumentImageImportAnswer } from './workspace.ts'
import { DOCUMENT_IMAGE_MAX_BYTES } from './workspace.ts'

export interface DocumentWorkspaceImageInspect { source: CanonicalSource, path: string }
export interface DocumentWorkspaceImageImport { id: string, source: CanonicalSource, file: { path: string, sha256: string, byteLength: number } }
export interface WorkspaceImageInspection {
  document: string, source: CanonicalSource
  file: { path: string, sha256: string, byteLength: number }
  image: { mediaType: string, dimensions: { width: number, height: number } }
}
export interface VerifiedDocumentImageImport extends DocumentImageImportAnswer {
  verification: { saved: true, source: CanonicalSource, asset: { assetId: string, path: string, sha256: string, byteLength: number }, compiled: 'not-requested', runtime: 'not-requested' }
}
export interface DocumentImageCapabilities {
  source: CanonicalSource, available: true, verification: 'configuration-only'
  actions: { inspectWorkspace: true, importWorkspace: boolean }
  importUnavailableReason?: 'review-required' | 'operation-disabled'
  limits: { imageBytes: number, receipts: number, concurrent: number }, workspaceFileScope: 'same-document', idempotency: 'process-current-source'
  review: 'required-unsupported' | 'locks-and-history' | 'locks-only'
}
export interface DocumentImageAuthoring {
  capabilities(document: string, member: Member): Promise<DocumentImageCapabilities>
  inspectWorkspace(document: string, request: DocumentWorkspaceImageInspect, member: Member, signal?: AbortSignal): Promise<WorkspaceImageInspection>
  /** The import's checks without its transaction (scope, file bytes and SHA-256/length, current source or a replayable receipt), so a doomed import is refused before the author is asked; `importWorkspace` checks everything again. */
  checkWorkspaceImport(document: string, request: DocumentWorkspaceImageImport, member: Member, signal?: AbortSignal): Promise<void>
  importWorkspace(document: string, request: DocumentWorkspaceImageImport, member: Member, signal?: AbortSignal): Promise<VerifiedDocumentImageImport>
}
const source = { type: 'object', additionalProperties: false, properties: { documentId: { type: 'string', minLength: 1, maxLength: 200 }, version: { type: 'string', pattern: '^[a-f\\d]{20}$' }, fingerprint: { type: 'string', pattern: '^[a-f\\d]{16}$' } }, required: ['documentId', 'version', 'fingerprint'] } as const
export const DOCUMENT_WORKSPACE_IMAGE_INSPECTION_SCHEMA = { type: 'object', additionalProperties: false, properties: { source, path: { type: 'string', minLength: 1, maxLength: 1024 } }, required: ['source', 'path'] } as const
export const DOCUMENT_WORKSPACE_IMAGE_IMPORT_SCHEMA = { type: 'object', additionalProperties: false, properties: { id: { type: 'string', minLength: 1, maxLength: 200 }, source, file: { type: 'object', additionalProperties: false, properties: { path: { type: 'string', minLength: 1, maxLength: 1024 }, sha256: { type: 'string', pattern: '^[a-f\\d]{64}$' }, byteLength: { type: 'integer', minimum: 1, maximum: DOCUMENT_IMAGE_MAX_BYTES } }, required: ['path', 'sha256', 'byteLength'] } }, required: ['id', 'source', 'file'] } as const
