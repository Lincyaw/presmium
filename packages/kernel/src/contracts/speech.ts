import { defineService } from './service.ts'

export interface SpeechWord { text: string, start: number, end: number }

export interface Synthesis {
  audio: Blob | string
  mime: string
  duration: number
  words?: SpeechWord[]
  key: string
  engine: string
  model: string
  voice: string
  provider: string
  synthetic: true
}

export interface AigcLabel {
  Label: '1'
  ContentProducer: string
  ProduceID: string
  ReservedCode1: string
  ContentPropagator: string
  PropagateID: string
  ReservedCode2: string
}

export interface TranscriptSegment { start: number, end: number, text: string, words: SpeechWord[] }

export interface Transcript {
  lang: string
  duration: number
  text: string
  segments: TranscriptSegment[]
}

export interface SpeechEngineInfo {
  id: string
  provider: string
  stt: boolean
  tts: boolean
  wordTimes: boolean
  local: boolean
}

export interface VoiceInfo {
  id: string
  label: string
  lang: string[]
  cloned?: boolean
}

/** A provider list may be empty. An unsupported catalogue must not be presented as an empty list. */
export type VoiceCatalog =
  | { status: 'available', source: 'provider' | 'bundled', voices: VoiceInfo[] }
  | { status: 'unavailable', reason: 'not-configured' | 'unsupported' | 'unknown', voices: VoiceInfo[] }

export interface SynthesisRequest {
  engine?: string
  voice: string
  text: string
  lang: string
  rate?: number
  style?: string
  lexicon?: Record<string, string>
}

export interface TranscriptionRequest {
  engine?: string
  audio: Blob
  lang?: string
  hints?: string[]
}

export interface SpeechService {
  engines(): Promise<SpeechEngineInfo[]>
  voices(engine: string, lang?: string): Promise<VoiceInfo[]>
  /** Lists registered voices without synthesis. Absence means catalogue availability is unknown. */
  voiceCatalog?(engine?: string, lang?: string, signal?: AbortSignal): Promise<VoiceCatalog>
  synthesize(request: SynthesisRequest, signal?: AbortSignal): Promise<Synthesis>
  /** Exact request lookup only. A miss never calls synthesis or transcription providers. */
  lookup?(request: SynthesisRequest, signal?: AbortSignal): Promise<Synthesis | undefined>
  cached?(key: string, signal?: AbortSignal): Promise<Synthesis | undefined>
  alignWords?(key: string, options: { lang: string, transcribe?: boolean }, signal?: AbortSignal): Promise<SpeechWord[] | undefined>
  pruneLock?(keep: ReadonlySet<string>): Promise<number>
  transcribe(request: TranscriptionRequest, signal?: AbortSignal): Promise<Transcript>
}

export const SPEECH = defineService<SpeechService>('presmium.speech')
