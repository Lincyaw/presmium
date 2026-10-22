import type { AigcLabel, SpeechWord, SynthesisRequest, Transcript, TranscriptionRequest, VoiceInfo } from '@lincyaw/kernel'
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
  defaultEngine(): Promise<string | undefined>
  voices(engine: string | undefined, lang?: string, signal?: AbortSignal): Promise<VoiceInfo[]>
  synthesize(request: SynthesisRequest, signal?: AbortSignal): Promise<SynthesisResult>
  transcribe(request: TranscriptionRequest, signal?: AbortSignal): Promise<Transcript>
  consent(engine: string, voice: string, recorded: boolean, signal?: AbortSignal): Promise<void>
}
