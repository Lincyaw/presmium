import type { SpeechEngineInfo, SpeechVoice, VoiceCatalog } from './speech.ts'
import type { CanonicalSource } from '../ir.ts'
import { defineService } from './service.ts'

/** A step number is usable only with the structure binding returned by the current snapshot. */
export interface VoiceTarget { section: string, step: number, binding: string }
export type VoiceScope = { kind: 'document' } | { kind: 'page', section: string } | { kind: 'step', target: VoiceTarget } | { kind: 'steps', targets: VoiceTarget[] }
export interface StepVoiceOverride extends VoiceTarget { voice: SpeechVoice }
export interface VoiceOverrides { pages: Record<string, SpeechVoice>, steps: StepVoiceOverride[] }
export interface ResolvedVoice {
  target: VoiceTarget
  voice?: SpeechVoice
  inheritedFrom: 'step' | 'page' | 'document' | 'unset'
  override?: SpeechVoice
  editable: boolean
  reason?: 'cue-step' | 'step-binding-stale' | 'recording-unavailable'
}
/** Registered by the actual lecture plugin implementation, never inferred from authored configuration. */
export const VOICEOVER = defineService<{ version: 1, preview: true }>('presmium.voiceover')
export interface VoiceoverCapability {
  available: boolean
  reason?: 'not-configured' | 'voice-unset' | 'step-binding-stale' | 'speech-unavailable' | 'voice-unavailable' | 'catalog-unavailable'
  providers: SpeechEngineInfo[]
  defaultEngine?: string
}
export interface VoiceoverStepStatus {
  target: VoiceTarget
  state: 'ready' | 'missing' | 'blocked' | 'empty'
  utterances: number
  cached: number
  reason?: string
}
export interface VoiceoverSnapshot {
  revision: string
  source: CanonicalSource
  capability: VoiceoverCapability
  steps: VoiceoverStepStatus[]
  jobs: VoiceoverJob[]
  /** Real speech units whose source cannot yet be assigned to one full-document step. */
  unboundByPage?: { section: string, state: VoiceoverStepStatus['state'], utterances: number, cached: number, reason?: string }[]
}
export type VoiceoverJobState = 'queued' | 'running' | 'cancelling' | 'cancelled' | 'done' | 'failed' | 'stale'
export interface VoiceoverJob {
  id: string
  /** Client-owned generation intent, available before the job response is delivered. */
  intent: string
  revision: string
  source: CanonicalSource
  scope: VoiceScope
  state: VoiceoverJobState
  total: number
  completed: number
  failed: number
  createdAt: string
  finishedAt?: string
  error?: string
}
export interface VoiceoverRequest { intent: string, revision: string, source: CanonicalSource, scope: VoiceScope, confirmed: boolean }
/** Cancellation can precede admission; a pre-admission refusal is not a fabricated job. */
export interface VoiceoverCancellation { intent: string, state: VoiceoverJobState, job?: VoiceoverJob }
export interface VoicePreviewRequest {
  revision: string
  source: CanonicalSource
  voice: SpeechVoice
  mode: 'sample' | 'step'
  target?: VoiceTarget
  confirmed: boolean
  quote: string
}
export type VoicePreviewQuery = Omit<VoicePreviewRequest, 'confirmed' | 'quote' | 'source'>
export interface VoicePreviewQuote extends VoicePreviewQuery {
  source: CanonicalSource
  text: string
  provider: string
  local: boolean
  cached: boolean
  quote: string
}
export interface VoicePreviewAnswer {
  revision: string
  source: CanonicalSource
  voice: SpeechVoice
  text: string
  cached: boolean
  key: string
  audio: string
  duration: number
  provider: string
}
export interface VoiceCatalogAnswer {
  engines: SpeechEngineInfo[]
  catalog: VoiceCatalog
  engine?: string
}
