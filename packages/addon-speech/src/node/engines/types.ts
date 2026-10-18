import type { SpeechWord, Transcript, VoiceInfo } from '@presmium/kernel'

export interface EngineSynthesis {
  voice: string
  text: string
  lang: string
  rate?: number
  style?: string
}

export interface EngineAudio {
  audio: Uint8Array
  contentType?: string
  words?: SpeechWord[]
  duration?: number
}

export interface EngineInput {
  audio: Uint8Array
  mime: string
  lang?: string
  hints?: string[]
}

export interface EngineAdapter {
  voices(lang?: string, signal?: AbortSignal): Promise<VoiceInfo[]>
  cloned?(voice: string): boolean
  synthesize(request: EngineSynthesis, signal?: AbortSignal): Promise<EngineAudio>
  transcribe(input: EngineInput, signal?: AbortSignal): Promise<Transcript>
}

export function speaks(voice: VoiceInfo, lang: string | undefined): boolean {
  if (!lang || voice.lang.length === 0) return true
  const primary = (tag: string) => tag.toLowerCase().split('-')[0]
  return voice.lang.some(tag => primary(tag) === primary(lang))
}
