/** Speech (P-132, P-133; docs/architecture.md 4.8): synthesis, transcription and the engines that do them. */
import { defineService } from './service.ts'

/** Seconds; one Chinese character each. */
export interface SpeechWord { text: string, start: number, end: number }

const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u
const LETTER = /[\p{L}\p{N}'’]/u

/** A word of a text and where it is (UTF-16 offsets). */
export interface TextWord { text: string, start: number, end: number }

/**
 * The words of a text, as speech engines time them and the lecture binds
 * events to them (docs/ir.md 2.9): each CJK character, each run of other
 * letters and digits; spaces and punctuation are not words.
 */
export function splitWords(text: string): TextWord[] {
  const words: TextWord[] = []
  let run: TextWord | undefined
  let at = 0
  for (const char of text) {
    if (CJK.test(char)) {
      if (run) words.push(run)
      run = undefined
      words.push({ text: char, start: at, end: at + char.length })
    } else if (LETTER.test(char)) {
      run ??= { text: '', start: at, end: at }
      run.text += char
      run.end = at + char.length
    } else if (run) {
      words.push(run)
      run = undefined
    }
    at += char.length
  }
  if (run) words.push(run)
  return words
}

/** A replacement of the written text in the spoken one (a `{say}`, a lexicon entry): `from`–`to` spoken, `start`–`end` written. */
export interface WordSpan { from: number, to: number, start: number, end: number }

/** A word of the written text with its times, and where it starts in that text when known (`remapWords`). */
export interface WrittenWord extends SpeechWord { offset?: number }

/**
 * The words an engine timed over the spoken text as words of the written
 * one: the words that say one replacement become one word, its written form
 * (as written, spaces included), from the first one's start to the last
 * one's end; the others are the same in both. When a word is not found in
 * the spoken text, in order, the words are given as the engine gave them,
 * without places.
 */
export function remapWords(words: readonly SpeechWord[], written: string, spoken: string, spans: readonly WordSpan[]): WrittenWord[] {
  const places: { start: number, end: number }[] = []
  let at = 0
  for (const word of words) {
    const index = word.text ? spoken.indexOf(word.text, at) : -1
    if (index < 0) return words.map(w => ({ ...w }))
    places.push({ start: index, end: at = index + word.text.length })
  }
  /** A place in the spoken text, outside the replacements, as a place in the written text. */
  const writtenAt = (offset: number) => {
    let shift = 0
    for (const span of spans) {
      if (offset < span.from) break
      if (offset < span.to) return span.start
      shift += (span.end - span.start) - (span.to - span.from)
    }
    return offset + shift
  }
  const result: WrittenWord[] = []
  let group: { span: WordSpan, word: WrittenWord } | undefined
  words.forEach((word, i) => {
    const { start, end } = places[i]!
    const span = spans.find(s => start < s.to && end > s.from)
    if (span && group?.span === span) {
      group.word.end = Math.max(group.word.end, word.end)
      return
    }
    group = undefined
    if (span) {
      const placed = { text: written.slice(span.start, span.end), start: word.start, end: word.end, offset: span.start }
      group = { span, word: placed }
      result.push(placed)
    } else {
      result.push({ ...word, offset: writtenAt(start) })
    }
  })
  return result
}

export interface Synthesis {
  /** A Blob in the browser; in Node the path of the file in the synthesis cache. */
  audio: Blob | string
  /**
   * The format the engine returned, which the cache does not re-encode: the
   * speech service asks engines for Ogg/Opus (`audio/ogg`) and keeps another
   * format of an engine that gives only that (the fake engine's `audio/wav`).
   * The speech service writes the AI-generated label into its metadata.
   */
  mime: string
  /** Seconds. */
  duration: number
  words?: SpeechWord[]
  /** Key in the synthesis cache. */
  key: string
  engine: string
  model: string
  voice: string
  synthetic: true
}

export interface TranscriptSegment { start: number, end: number, text: string, words: SpeechWord[] }

export interface Transcript {
  lang: string
  /** Seconds. */
  duration: number
  text: string
  segments: TranscriptSegment[]
}

export interface SpeechEngineInfo {
  id: string
  /**
   * Name of the service provider, which the UI shows (N-08). From the
   * operator's configuration, known before any request: an engine the
   * operator defines has `PRESMIUM_SPEECH_<ID>_PROVIDER` (required);
   * `volcengine` is 火山引擎 (`Volcengine` in English, by the request's `Accept-Language`).
   */
  provider: string
  stt: boolean
  tts: boolean
  /** Synthesis gives times per character or word. */
  wordTimes: boolean
  /** Sends no data to a third party. */
  local: boolean
}

export interface VoiceInfo {
  id: string
  label: string
  lang: string[]
  /**
   * A clone of someone's voice: synthesized only when the operator sets
   * `cloned: true` and the consent directory (`consentDir`, docs/ir.md section
   * 10) of the operator directory holds that person's consent record (N-08);
   * records in the deck directory do not count.
   */
  cloned?: boolean
}

export interface SynthesisRequest {
  engine?: string
  voice: string
  text: string
  /** BCP 47 language tag. */
  lang: string
  rate?: number
  style?: string
  /** Pronunciation lexicon: written form to spoken form. */
  lexicon?: Record<string, string>
}

export interface TranscriptionRequest {
  engine?: string
  audio: Blob
  lang?: string
  /** Hot words, e.g. the deck's terms. */
  hints?: string[]
}

export interface SpeechService {
  /**
   * The engines the operator defined and that are therefore available:
   * address and credentials paired in this process's environment.
   */
  engines(): Promise<SpeechEngineInfo[]>
  voices(engine: string, lang?: string): Promise<VoiceInfo[]>
  /**
   * Looks in the synthesis cache first and sends no request on a hit; on a
   * miss calls the engine and writes the result to the cache with the
   * AI-generated label in the audio's metadata. Rejects (an error with the
   * reason) when the engine is unavailable, or for a cloned voice without the
   * setting or a valid consent record.
   */
  synthesize(request: SynthesisRequest, signal?: AbortSignal): Promise<Synthesis>
  transcribe(request: TranscriptionRequest, signal?: AbortSignal): Promise<Transcript>
}

export const SPEECH = defineService<SpeechService>('presmium.speech')
