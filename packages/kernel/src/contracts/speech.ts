/** Speech (P-132, P-133; docs/architecture.md 4.8): synthesis, transcription and the engines that do them. */
import { defineService } from './service.ts'

/** Seconds; one Chinese character each. */
export interface SpeechWord { text: string, start: number, end: number }

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
   * records in the deck directory do not count. In SHARED mode the directory
   * is in the gateway container only.
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
   * The engines the operator defined and that are therefore available: in
   * LOCAL mode, address and credentials paired in this process's environment;
   * in SHARED mode they are in the gateway's environment only, and the list
   * (with the providers) comes from the gateway.
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
