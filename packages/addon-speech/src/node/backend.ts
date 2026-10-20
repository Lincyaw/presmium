import { createHash } from 'node:crypto'
import type { SpeechWord, SynthesisRequest, Transcript, TranscriptionRequest, VoiceInfo } from '@lincyaw/kernel'
import type { AigcLabel, EngineListing } from '../domain/index.ts'
import { engineId } from '../domain/index.ts'

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
  listing(lang?: string): Promise<EngineListing>
  defaultEngine(): Promise<string | undefined>
  voices(engine: string | undefined, lang?: string, signal?: AbortSignal): Promise<VoiceInfo[]>
  synthesize(request: SynthesisRequest, signal?: AbortSignal): Promise<SynthesisResult>
  transcribe(request: TranscriptionRequest, signal?: AbortSignal): Promise<Transcript>
  consent(engine: string, voice: string, recorded: boolean, signal?: AbortSignal): Promise<void>
}

export function cacheKey(request: SynthesisRequest & { engine: string }, spoken: string): string {
  const parts = ['presmium.speech/1', engineId(request.engine), request.voice, request.lang, request.rate ?? 1, request.style ?? '', request.text, spoken]
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 32)
}
