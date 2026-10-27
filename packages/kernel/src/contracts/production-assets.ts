import type { Asset, MediaClip, TimeRange } from './document.ts'
import type { ProductionBinding, ProductionPlan, ProductionPlanQuery } from './production.ts'
import type { CanonicalSource } from '../ir.ts'
import type { DocumentChangeAnswer } from './workspace.ts'
import { defineService } from './service.ts'

/** Actual local audio metadata, derived from a bounded, regular file rather than authored duration. */
export interface ProductionAssetInspection {
  assetId: string
  mediaId: string
  kind: 'audio'
  sha256: string
  durationMs: number
  byteLength: number
  mediaType: string
  codec: string
  sampleRate: number
  channels: number
}
export interface ProductionAssetQuery extends ProductionPlanQuery { assetId: string }
export interface ProductionAssetAnswer extends ProductionPlanQuery { asset: ProductionAssetInspection }

/** Multipart fields are change (this JSON) and file (the original bytes). Import does not attach a clip. */
export const DOCUMENT_AUDIO_MAX_BYTES = 16 << 20
export interface DocumentAudioImport { id: string, baseDocumentVersion: string }
export interface DocumentAudioImportAnswer extends DocumentChangeAnswer { assetId: string, inspection: ProductionAssetInspection }
/** Reads a declared asset directly from the saved document, including assets not yet used by a clip. */
export interface DocumentAudioInspectionAnswer { document: string, version: string, fingerprint: string, inspection: ProductionAssetInspection }
export type DocumentMediaClipChange =
  | { id: string, baseDocumentVersion: string, binding: ProductionBinding, clip: MediaClip }
  | { id: string, baseDocumentVersion: string, removeClipId: string }

export class ProductionAudioRefusal extends Error {
  readonly status: number
  readonly code: string
  constructor(status: number, code: string) { super(code); this.status = status; this.code = code }
}
/** Node-only media capabilities. Workspace authoring owns the transaction; the plugin owns real media inspection. */
export interface ProductionAudioPlanQuery { source: CanonicalSource, irRevision?: string }
export interface ProductionAudioAuthoring {
  inspectBytes(assetId: string, bytes: Uint8Array, signal?: AbortSignal): Promise<{ inspection: ProductionAssetInspection, extension: string }>
  inspectAsset(asset: Asset, signal?: AbortSignal): Promise<ProductionAssetInspection>
  /** Cache-only projection of an existing real IR; this never compiles or synthesizes. */
  readPlan(query: ProductionAudioPlanQuery, signal?: AbortSignal): Promise<ProductionPlan>
  validateClips(binding: ProductionBinding, clips: MediaClip[], assets: Record<string, Asset>, signal?: AbortSignal): Promise<void>
}
export const PRODUCTION_AUDIO_AUTHORING = defineService<ProductionAudioAuthoring>('presmium.productionAudioAuthoring')

/** One non-destructive use of an inspected file, placed inside an already confirmed step. */
export interface ProductionAudioClip {
  id: string
  assetId: string
  mediaId: string
  sectionId: string
  stepId: string
  startMs: number
  endMs: number
  sourceRange: TimeRange
  volume: number
  muted: boolean
}
