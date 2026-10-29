import type { SpeechWord, Transcript, VoiceCatalog, VoiceCloneState, VoiceInfo } from '@lincyaw/kernel'

export interface EngineSynthesisRequest {
  voice: string
  text: string
  lang: string
  rate?: number
  style?: string
}

export interface EngineSynthesisResult {
  audio: Uint8Array
  contentType?: string
  words?: SpeechWord[]
  duration?: number
}

export interface EngineTranscriptionRequest {
  audio: Uint8Array
  mime: string
  lang?: string
  hints?: string[]
}

export interface EngineCloneRequest {
  voice: string
  audio: Uint8Array
  mime: string
  lang?: string
  text?: string
}

export interface EngineCloneStatus {
  state: VoiceCloneState
  trainingsLeft?: number
  message?: string
}

export interface EngineAdapter {
  voices(lang?: string, signal?: AbortSignal): Promise<VoiceInfo[]>
  voiceCatalog(lang?: string, signal?: AbortSignal): Promise<VoiceCatalog>
  cloned?(voice: string): boolean
  synthesize(request: EngineSynthesisRequest, signal?: AbortSignal): Promise<EngineSynthesisResult>
  transcribe(input: EngineTranscriptionRequest, signal?: AbortSignal): Promise<Transcript>
  /** Trains `voice` from a sample; absent when the engine cannot clone. */
  clone?(request: EngineCloneRequest, signal?: AbortSignal): Promise<EngineCloneStatus>
  cloneStatus?(voice: string, signal?: AbortSignal): Promise<EngineCloneStatus>
}

export function speaks(voice: VoiceInfo, lang: string | undefined): boolean {
  if (!lang || voice.lang.length === 0) return true
  const primary = (tag: string) => tag.toLowerCase().split('-')[0]
  return voice.lang.some(tag => primary(tag) === primary(lang))
}
