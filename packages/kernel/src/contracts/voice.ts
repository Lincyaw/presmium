import type { SpeechEngineInfo, SpeechVoice, VoiceCatalog } from './speech.ts'
import type { Revision } from './workspace.ts'
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
export interface VoiceSettingsAnswer {
  document: string
  revision: string
  source: { path: string, version: string }
  default?: SpeechVoice
  overrides: VoiceOverrides
  steps: ResolvedVoice[]
  selected?: ResolvedVoice
  capabilities: { voiceover: boolean, preview: boolean }
  defaultEngine?: string
}

/** Registered by the actual lecture plugin implementation, never inferred from authored configuration. */
export const VOICEOVER = defineService<{ version: 1, preview: true }>('presmium.voiceover')
export interface VoiceSettingsUpdate {
  revision: string
  base: string
  scope: VoiceScope
  voice: SpeechVoice | null
  replaceOverrides?: boolean
  /** Preview affected counts first. Source is changed only when this is explicitly true. */
  apply?: boolean
}
export interface VoiceSettingsChange extends VoiceSettingsAnswer {
  updated: number
  preserved: number
  applied: boolean
  /** A write returns its source version; compilation may still be pending. */
  sourceVersion?: string
  commit?: Revision
}

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
  capability: VoiceoverCapability
  steps: VoiceoverStepStatus[]
  jobs: VoiceoverJob[]
  /** Real speech units whose source cannot yet be assigned to one full-document step. */
  unboundByPage?: { section: string, state: VoiceoverStepStatus['state'], utterances: number, cached: number, reason?: string }[]
}
export type VoiceoverJobState = 'queued' | 'running' | 'cancelling' | 'cancelled' | 'done' | 'failed' | 'stale'
export interface VoiceoverJob {
  id: string
  revision: string
  scope: VoiceScope
  state: VoiceoverJobState
  total: number
  completed: number
  failed: number
  createdAt: string
  finishedAt?: string
  error?: string
}
export interface VoiceoverRequest { revision: string, scope: VoiceScope, confirmed: boolean }
export interface VoicePreviewRequest {
  revision: string
  voice: SpeechVoice
  mode: 'sample' | 'step'
  target?: VoiceTarget
  confirmed: boolean
  quote: string
}
export type VoicePreviewQuery = Omit<VoicePreviewRequest, 'confirmed' | 'quote'>
export interface VoicePreviewQuote extends VoicePreviewQuery {
  text: string
  provider: string
  local: boolean
  cached: boolean
  quote: string
}
export interface VoicePreviewAnswer {
  revision: string
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
