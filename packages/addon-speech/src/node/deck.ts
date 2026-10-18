import type { SynthesisRequest, TranscriptionRequest } from '@presmium/kernel'
import type { DeckSpeechConfig } from '../domain/index.ts'
import { applyLexicon } from '../domain/index.ts'
import type { SpeechBackend, SynthesisResult } from './backend.ts'
import { cacheKey } from './backend.ts'
import type { SynthesisCache } from './cache.ts'

export class DeckSpeech implements SpeechBackend {
  readonly #inner: SpeechBackend
  readonly #defaults: DeckSpeechConfig
  readonly cache: SynthesisCache

  constructor(inner: SpeechBackend, cache: SynthesisCache, defaults: DeckSpeechConfig) {
    this.#inner = inner
    this.cache = cache
    this.#defaults = defaults
  }

  listing(lang?: string) {
    return this.#inner.listing(lang)
  }

  async defaultEngine() {
    return this.#defaults.engine ?? this.#inner.defaultEngine()
  }

  voices(engine: string | undefined, lang?: string, signal?: AbortSignal) {
    return this.#inner.voices(engine ?? this.#defaults.engine, lang, signal)
  }

  async cached(request: SynthesisRequest, signal?: AbortSignal): Promise<{ result: SynthesisResult, file: string }> {
    const engine = request.engine ?? await this.defaultEngine()
    if (!engine) return this.#write(await this.#inner.synthesize(request, signal), request)
    const key = cacheKey({ ...request, engine }, applyLexicon(request.text, request.lexicon))
    const hit = await this.cache.find(key)
    if (hit) {
      const { record, file, audio } = hit
      await this.#inner.consent(record.engine, record.voice, record.cloned === true, signal)
      const result: SynthesisResult = {
        audio: new Uint8Array(audio),
        mime: record.mime,
        ext: record.audio.split('.').at(-1)!,
        duration: record.duration,
        ...record.words ? { words: record.words } : {},
        engine: record.engine,
        model: record.model,
        voice: record.voice,
        provider: record.provider,
        cloned: record.cloned,
        key,
        AIGC: record.AIGC,
      }
      return { result, file }
    }
    return this.#write(await this.#inner.synthesize({ ...request, engine }, signal), request)
  }

  async #write(result: SynthesisResult, request: SynthesisRequest): Promise<{ result: SynthesisResult, file: string }> {
    return { result, file: (await this.cache.write(result, request)).file }
  }

  async synthesize(request: SynthesisRequest, signal?: AbortSignal): Promise<SynthesisResult> {
    return (await this.cached(request, signal)).result
  }

  consent(engine: string, voice: string, recorded: boolean, signal?: AbortSignal): Promise<void> {
    return this.#inner.consent(engine, voice, recorded, signal)
  }

  transcribe(request: TranscriptionRequest, signal?: AbortSignal) {
    return this.#inner.transcribe({ ...request, engine: request.engine ?? this.#defaults.transcribe ?? this.#defaults.engine }, signal)
  }
}
