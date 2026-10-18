import { isRecord } from '@presmium/kernel'
import type { SpeechEngineInfo, SpeechWord, SynthesisRequest, Transcript, VoiceInfo } from '@presmium/kernel'
import type { AigcLabel } from './aigc.ts'
import type { UnavailableEngine } from './engines.ts'

export interface ListedEngine extends SpeechEngineInfo {
  model: string
  transcribeModel: string
}

export interface EngineListing {
  engines: ListedEngine[]
  unavailable: UnavailableEngine[]
}

export interface VoiceListing {
  voices: VoiceInfo[]
}

export interface SpeechBody {
  engine?: string
  voice: string
  input: string
  lang?: string
  speed?: number
  style?: string
  lexicon?: Record<string, string>
}

export interface TimedSpeech {
  audio: string
  format: string
  mime: string
  duration: number
  words?: SpeechWord[]
  engine: string
  model: string
  voice: string
  provider: string
  cloned: boolean
  key: string
  synthetic: true
  AIGC: AigcLabel
}

export interface TranscriptionAnswer extends Transcript {
  language: string
  words: SpeechWord[]
}

export function speechBody(request: SynthesisRequest): SpeechBody {
  return {
    ...request.engine ? { engine: request.engine } : {},
    voice: request.voice,
    input: request.text,
    lang: request.lang,
    ...request.rate !== undefined ? { speed: request.rate } : {},
    ...request.style ? { style: request.style } : {},
    ...request.lexicon ? { lexicon: request.lexicon } : {},
  }
}

export function synthesisRequestOf(body: unknown): SynthesisRequest | string {
  if (!isRecord(body)) return 'a JSON object { voice, input, lang?, engine?, speed?, style?, lexicon? }'
  const text = typeof body.input === 'string' ? body.input : typeof body.text === 'string' ? body.text : undefined
  if (typeof body.voice !== 'string' || !body.voice) return 'voice is needed'
  if (!text?.trim()) return 'input (the text to speak) is needed'
  const lexicon = isRecord(body.lexicon) ? Object.fromEntries(Object.entries(body.lexicon).filter((entry): entry is [string, string] => typeof entry[1] === 'string')) : undefined
  return {
    ...typeof body.engine === 'string' && body.engine ? { engine: body.engine } : {},
    voice: body.voice,
    text,
    lang: typeof body.lang === 'string' && body.lang ? body.lang : 'zh-CN',
    ...typeof body.speed === 'number' && body.speed > 0 ? { rate: body.speed } : {},
    ...typeof body.style === 'string' && body.style ? { style: body.style } : {},
    ...lexicon && Object.keys(lexicon).length ? { lexicon } : {},
  }
}

export function transcriptOf(answer: TranscriptionAnswer): Transcript {
  return { lang: answer.lang ?? answer.language, duration: answer.duration, text: answer.text, segments: answer.segments }
}
