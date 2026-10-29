import type { AigcLabel, SpeechWord, SynthesisRequest, Transcript, TranscriptionRequest, VoiceCatalog, VoiceCloneStatus, VoiceInfo } from '@lincyaw/kernel'
import type { EnginesResponseBody } from '../domain/index.ts'

export interface SynthesisResult {
  audio: Uint8Array
  mime: string
  ext: string
  duration: number
  words?: SpeechWord[]
  engine: string
  model: string
  voice: string
  provider: string
  cloned: boolean
  key: string
  requestKey?: string
  profile?: string
  AIGC: AigcLabel
}

/** Training a cloned voice: the sample, and the speaker's consent with their recorded statement. */
export interface CloneInput {
  engine?: string
  voice: string
  sample: Uint8Array
  sampleMime: string
  lang?: string
  text?: string
  consent: { speaker: string, scope: string, statement: Uint8Array, statementMime: string }
}

export type CacheProfile = { status: 'configured', profile: string, model: string, provider: string } | { status: 'absent' | 'unavailable' }

export interface SpeechBackend {
  listEngines(lang?: string): Promise<EnginesResponseBody>
  defaultSynthesisEngine(): Promise<string | undefined>
  /** Configuration identity only: never contacts a provider and never includes credentials. */
  cacheProfile(engine: string | undefined, use: 'synthesize' | 'transcribe', lang?: string): Promise<CacheProfile>
  voices(engine: string | undefined, lang?: string, signal?: AbortSignal): Promise<VoiceInfo[]>
  voiceCatalog?(engine: string | undefined, lang?: string, signal?: AbortSignal): Promise<VoiceCatalog>
  synthesize(request: SynthesisRequest, signal?: AbortSignal): Promise<SynthesisResult>
  transcribe(request: TranscriptionRequest, signal?: AbortSignal): Promise<Transcript>
  consent(engine: string, voice: string, recorded: boolean, signal?: AbortSignal): Promise<void>
  /** Registers the consent, then starts training; absent when cloning is not wired. */
  cloneVoice?(input: CloneInput, signal?: AbortSignal): Promise<VoiceCloneStatus>
  cloneStatus?(engine: string | undefined, voice: string, signal?: AbortSignal): Promise<VoiceCloneStatus>
}
