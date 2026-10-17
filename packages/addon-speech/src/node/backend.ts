/**
 * What answers the speech gateway's protocol (./routes.ts) and stands behind
 * the Node `SPEECH` service: the engines of this process's environment
 * (./core.ts, LOCAL mode and the gateway), the gateway seen from serve and
 * agent-host (./remote.ts, SHARED mode), and a deck's synthesis cache over
 * either (./deck.ts).
 */
import { createHash } from 'node:crypto'
import type { SpeechWord, SynthesisRequest, Transcript, TranscriptionRequest, VoiceInfo } from '@presmium/kernel'
import type { AigcLabel, EngineListing } from '../domain/index.ts'
import { engineId } from '../domain/index.ts'

export interface SynthesisResult {
  /** Labeled with `AIGC` in its metadata. */
  audio: Uint8Array
  mime: string
  /** `wav` or `ogg`: the cache file's extension. */
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
  /** The engine a request that names none takes; undefined when none is defined. */
  defaultEngine(): Promise<string | undefined>
  voices(engine: string | undefined, lang?: string, signal?: AbortSignal): Promise<VoiceInfo[]>
  synthesize(request: SynthesisRequest, signal?: AbortSignal): Promise<SynthesisResult>
  transcribe(request: TranscriptionRequest, signal?: AbortSignal): Promise<Transcript>
  /**
   * Refuses (a `SpeechError` 403) a cloned voice the operator does not allow
   * now, as a synthesis in it is refused (the setting and the consent record,
   * ./consent.ts): a cache answers a clip in a cloned voice only after this
   * (N-08, decision D-7), so a withdrawn consent stops its clips too.
   */
  consent(engine: string, voice: string, signal?: AbortSignal): Promise<void>
}

/**
 * The synthesis cache key: the sha256 of the engine, voice, language, rate,
 * style, the text and the text as spoken (the lexicon applied), so a change
 * of the lexicon that does not touch this text keeps the clip. The model is
 * not part of it: in SHARED mode only the gateway knows it, and a hit sends
 * no request; the record names it.
 */
export function cacheKey(request: SynthesisRequest & { engine: string }, spoken: string): string {
  const parts = ['presmium.speech/1', engineId(request.engine), request.voice, request.lang, request.rate ?? 1, request.style ?? '', request.text, spoken]
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 32)
}
