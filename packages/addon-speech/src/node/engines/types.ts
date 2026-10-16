/**
 * What an engine's adapter does (docs/architecture.md section 3: the
 * providers' interfaces appear only under this directory). Times are in
 * seconds; the speech service labels and caches what an adapter returns.
 */
import type { SpeechWord, Transcript, VoiceInfo } from '@presmium/kernel'

export interface EngineSynthesis {
  voice: string
  /** The text to speak, with the lexicon applied. */
  text: string
  /** BCP 47. */
  lang: string
  /** 1 is normal. */
  rate?: number
  style?: string
}

export interface EngineAudio {
  /** Ogg/Opus when the engine can give it; else its own format. */
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
  /** Whether a voice the list does not mark is a clone by the engine's own naming. */
  cloned?(voice: string): boolean
  synthesize(request: EngineSynthesis, signal?: AbortSignal): Promise<EngineAudio>
  transcribe(input: EngineInput, signal?: AbortSignal): Promise<Transcript>
}

/** Whether a voice speaks a language: a voice without languages speaks any; else the primary subtags match. */
export function speaks(voice: VoiceInfo, lang: string | undefined): boolean {
  if (!lang || voice.lang.length === 0) return true
  const primary = (tag: string) => tag.toLowerCase().split('-')[0]
  return voice.lang.some(tag => primary(tag) === primary(lang))
}
