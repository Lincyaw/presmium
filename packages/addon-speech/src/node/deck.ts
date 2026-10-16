/**
 * A deck's speech: its default engines (`presmium.speech.engine`,
 * `transcribe`) and its synthesis cache over the engines of this process
 * (LOCAL) or the gateway (SHARED). A synthesis looks in the cache first and
 * sends no request on a hit; a miss is synthesized and written to the cache.
 */
import { readFileSync } from 'node:fs'
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

  /** The synthesis and its audio file in the cache. */
  async cached(request: SynthesisRequest, signal?: AbortSignal): Promise<{ result: SynthesisResult, file: string }> {
    const engine = request.engine ?? await this.defaultEngine()
    // No engine at all: the inner service says so, and asks none.
    if (!engine) return this.#write(await this.#inner.synthesize(request, signal), request)
    const key = cacheKey({ ...request, engine }, applyLexicon(request.text, request.lexicon))
    const hit = this.cache.find(key)
    if (hit) {
      const { record, file } = hit
      const result: SynthesisResult = {
        audio: new Uint8Array(readFileSync(file)),
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

  #write(result: SynthesisResult, request: SynthesisRequest): { result: SynthesisResult, file: string } {
    return { result, file: this.cache.write(result, request).file }
  }

  async synthesize(request: SynthesisRequest, signal?: AbortSignal): Promise<SynthesisResult> {
    return (await this.cached(request, signal)).result
  }

  transcribe(request: TranscriptionRequest, signal?: AbortSignal) {
    return this.#inner.transcribe({ ...request, engine: request.engine ?? this.#defaults.transcribe ?? this.#defaults.engine }, signal)
  }
}
