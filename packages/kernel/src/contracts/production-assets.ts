import type { TimeRange } from './document.ts'
import type { ProductionPlanQuery } from './production.ts'

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
