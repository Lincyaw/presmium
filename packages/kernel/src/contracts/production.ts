import type { CanonicalSource } from '../ir.ts'
import type { TrackEvent } from './operations.ts'

/** One immutable derived plan; a cache change can change planId without changing the saved document. */
export interface ProductionBinding { source: CanonicalSource, irRevision: string, planId: string }
export function sameProductionBinding(a: ProductionBinding, b: ProductionBinding): boolean {
  return a.planId === b.planId && a.irRevision === b.irRevision && a.source.documentId === b.source.documentId && a.source.version === b.source.version && a.source.fingerprint === b.source.fingerprint
}
export interface ProductionPlaybackPosition {
  timeMs: number
  stepTimeMs?: number
  sectionId?: string
  stepId?: string
  durationMs: number
  playing: boolean
  rate: number
  trying: boolean
}
export interface ProductionPlaybackState {
  binding: ProductionBinding
  status: 'loading' | 'ready' | 'estimated' | 'unavailable' | 'failed'
  position?: ProductionPlaybackPosition
  error?: string
}
export type ProductionPlaybackCommand =
  | { binding: ProductionBinding, action: 'load' | 'pause' | 'play' }
  | { binding: ProductionBinding, action: 'seek', timeMs: number }
  | { binding: ProductionBinding, action: 'rate', rate: number }
export interface ProductionPlanQuery { source: CanonicalSource, irRevision: string }
export interface ProductionMediaQuery extends ProductionBinding { clipId: string }
export type ProductionTiming = 'confirmed' | 'estimated' | 'unknown'

/** All ranges use milliseconds in the single document-wide playback clock. Unknown boundaries are omitted. */
export interface ProductionRange { startMs?: number, endMs?: number, timing: ProductionTiming }
export interface ProductionAudio {
  clipId: string
  key: string
  durationMs: number
  /** Digest of the actual cached audio bytes, when available. Never inferred from a cache key. */
  sha256?: string
}
export interface ProductionSegment extends ProductionRange {
  id: string
  sectionId: string
  stepId: string
  /** A cue can advance through several steps inside this one audio/caption segment. */
  stepIds?: string[]
  narrationIds?: string[]
  sourceStepId?: string
  blockId?: string
  utteranceId?: string
  label: string
  status?: 'cached' | 'silent' | 'missing' | 'blocked'
  alignment?: 'words' | 'proportional' | 'none'
  audio?: ProductionAudio
  waveform?: number[]
  waveformStatus?: 'available' | 'unavailable'
}
export interface ProductionTrack { kind: 'visual' | 'voice' | 'caption', segments: ProductionSegment[] }
export interface ProductionStep extends ProductionRange { stepId: string, index: number, holdMs?: number, animationMs?: number }
export interface ProductionPage extends ProductionRange { sectionId: string, title: string, steps: ProductionStep[] }
export interface ProductionDiagnostic {
  code: string
  severity: 'info' | 'warning' | 'error'
  message: string
  sectionId?: string
  stepId?: string
  blockId?: string
  narrationId?: string
}
export interface ProductionPlan {
  binding: ProductionBinding
  durationMs?: number
  timing: ProductionTiming
  pages: ProductionPage[]
  tracks: ProductionTrack[]
  events: TrackEvent[]
  diagnostics: ProductionDiagnostic[]
  /** Requires a confirmed complete plan. Estimated placeholders remain inspectable, not playback-ready. */
  canPreview: boolean
  canExport: boolean
}
