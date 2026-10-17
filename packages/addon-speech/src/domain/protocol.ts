/**
 * The speech gateway's protocol (docs/design-v0.7.md 7.4): the OpenAI audio
 * API shape under `v1/`, which the browser, the Node service in SHARED mode
 * and the engines of that shape speak:
 *
 * - `GET engines`: the defined engines with their providers, and the
 *   unavailable ones with the reason;
 * - `GET audio/voices?engine=&lang=`: an engine's voices;
 * - `POST audio/speech`: the audio itself;
 * - `POST audio/speech/timestamps` (extension): `{ audio (base64), format,
 *   mime, duration, words, … }`, since no hosted speech interface gives times;
 * - `POST audio/transcriptions` (multipart: `file`, `engine`, `language`,
 *   `hints[]`): the `verbose_json` transcript with words;
 * - `GET audio/consent?engine=&voice=` (extension): `{ ok: true }` when the
 *   operator allows a cloned voice now, else 403 with the reason, which a
 *   cache asks before it answers with a clip in that voice.
 *
 * Requests name the engine by id (`engine`); a request without one takes the
 * deck's default, else the first defined engine. Errors are `{ error }`.
 */
import { isRecord } from '@presmium/kernel'
import type { SpeechEngineInfo, SpeechWord, SynthesisRequest, Transcript, VoiceInfo } from '@presmium/kernel'
import type { AigcLabel } from './aigc.ts'
import type { UnavailableEngine } from './engines.ts'

export interface ListedEngine extends SpeechEngineInfo {
  model: string
  transcribeModel: string
}

/** `GET engines`. */
export interface EngineListing {
  engines: ListedEngine[]
  unavailable: UnavailableEngine[]
}

/** `GET audio/voices`. */
export interface VoiceListing {
  voices: VoiceInfo[]
}

/** The body of `POST audio/speech` and `audio/speech/timestamps`: the OpenAI shape's, with Presmium's fields. */
export interface SpeechBody {
  engine?: string
  voice: string
  input: string
  /** BCP 47. */
  lang?: string
  /** Rate, 1 is normal. */
  speed?: number
  style?: string
  lexicon?: Record<string, string>
}

/** The answer of `POST audio/speech/timestamps`. */
export interface TimedSpeech {
  /** Base64. */
  audio: string
  /** `wav` or `ogg`. */
  format: string
  mime: string
  duration: number
  words?: SpeechWord[]
  engine: string
  model: string
  voice: string
  provider: string
  /** A cloned voice. */
  cloned: boolean
  /** The synthesis cache key. */
  key: string
  synthetic: true
  /** The AI-generated label written into the audio's metadata. */
  AIGC: AigcLabel
}

/** The answer of `POST audio/transcriptions`: the OpenAI shape's `verbose_json`, with Presmium's segments that hold their words. */
export interface TranscriptionAnswer extends Transcript {
  /** The OpenAI shape's name of `lang`. */
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

/** The synthesis request of a body; a string says what is wrong. */
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

/** The transcript of an answer of the OpenAI shape's `verbose_json` (Presmium's or an engine's). */
export function transcriptOf(answer: TranscriptionAnswer): Transcript {
  return { lang: answer.lang ?? answer.language, duration: answer.duration, text: answer.text, segments: answer.segments }
}
