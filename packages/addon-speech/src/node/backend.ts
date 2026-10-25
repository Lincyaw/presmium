import type { AigcLabel, SpeechWord, SynthesisRequest, Transcript, TranscriptionRequest, VoiceCatalog, VoiceInfo } from '@lincyaw/kernel'
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
  AIGC: AigcLabel
}

export interface SpeechBackend {
  listEngines(lang?: string): Promise<EnginesResponseBody>
  defaultSynthesisEngine(): Promise<string | undefined>
  voices(engine: string | undefined, lang?: string, signal?: AbortSignal): Promise<VoiceInfo[]>
  voiceCatalog?(engine: string | undefined, lang?: string, signal?: AbortSignal): Promise<VoiceCatalog>
  synthesize(request: SynthesisRequest, signal?: AbortSignal): Promise<SynthesisResult>
  transcribe(request: TranscriptionRequest, signal?: AbortSignal): Promise<Transcript>
  consent(engine: string, voice: string, recorded: boolean, signal?: AbortSignal): Promise<void>
}
