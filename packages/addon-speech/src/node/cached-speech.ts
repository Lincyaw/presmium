import { DOCUMENT_FILES, speechEngineId } from '@lincyaw/kernel'
import type { NodeServiceContext, SpeechWord, SynthesisRequest, TranscriptionRequest, VoiceCatalog } from '@lincyaw/kernel'
import type { DeckSpeechConfig } from '../domain/index.ts'
import { applyLexicon, deckSpeechConfig } from '../domain/index.ts'
import type { SpeechBackend, SynthesisResult } from './backend.ts'
import { cacheKey, SynthesisCache } from './cache.ts'
import type { SpeechCore } from './core.ts'
import { speechCore } from './core.ts'

export class CachedSpeech implements SpeechBackend {
  readonly #inner: SpeechBackend
  readonly #defaults: DeckSpeechConfig
  readonly cache: SynthesisCache

  constructor(inner: SpeechBackend, cache: SynthesisCache, defaults: DeckSpeechConfig) {
    this.#inner = inner
    this.cache = cache
    this.#defaults = defaults
  }

  listEngines(lang?: string) {
    return this.#inner.listEngines(lang)
  }

  async defaultSynthesisEngine() {
    return this.#defaults.engine ?? this.#inner.defaultSynthesisEngine()
  }

  /** Resolves the cache identity locally, including document defaults, without generating audio. */
  async synthesisKey(request: SynthesisRequest): Promise<string | undefined> {
    const engine = request.engine ?? await this.defaultSynthesisEngine()
    return engine ? cacheKey({ ...request, engine: speechEngineId(engine) }, applyLexicon(request.text, request.lexicon)) : undefined
  }

  /** The engine that transcribes without one named: the deck's transcription engine, else its default engine when that one transcribes. */
  async #transcriptionEngine(): Promise<string | undefined> {
    if (this.#defaults.transcribe) return this.#defaults.transcribe
    const named = this.#defaults.engine
    if (!named) return undefined
    const { engines } = await this.#inner.listEngines()
    return engines.find(engine => engine.id === speechEngineId(named))?.stt ? named : undefined
  }

  voices(engine: string | undefined, lang?: string, signal?: AbortSignal) {
    return this.#inner.voices(engine ?? this.#defaults.engine, lang, signal)
  }

  async voiceCatalog(engine: string | undefined, lang?: string, signal?: AbortSignal): Promise<VoiceCatalog> {
    return this.#inner.voiceCatalog?.(engine ?? this.#defaults.engine, lang, signal) ?? { status: 'unavailable', reason: 'unknown', voices: [] }
  }

  async synthesizeThroughCache(request: SynthesisRequest, signal?: AbortSignal): Promise<{ result: SynthesisResult, file: string }> {
    const engine = request.engine ?? await this.defaultSynthesisEngine()
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
    return (await this.synthesizeThroughCache(request, signal)).result
  }

  async alignWords(key: string, options: { lang: string, transcribe?: boolean }, signal?: AbortSignal): Promise<SpeechWord[] | undefined> {
    const kept = this.cache.readAlignment(key)
    if (kept) return kept
    if (options.transcribe === false) return undefined
    const hit = await this.cache.find(key)
    if (!hit) return undefined
    try {
      const transcript = await this.transcribe({ audio: new Blob([new Uint8Array(hit.audio)], { type: hit.record.mime }), lang: options.lang }, signal)
      const words = transcript.segments.flatMap(segment => segment.words)
      if (words.length === 0) return undefined
      await this.cache.writeAlignment(key, words)
      return words
    } catch {
      return undefined
    }
  }

  consent(engine: string, voice: string, recorded: boolean, signal?: AbortSignal): Promise<void> {
    return this.#inner.consent(engine, voice, recorded, signal)
  }

  async transcribe(request: TranscriptionRequest, signal?: AbortSignal) {
    const engine = request.engine ?? await this.#transcriptionEngine()
    return this.#inner.transcribe({ ...request, ...engine ? { engine } : {} }, signal)
  }
}

export type DeckSpeechContext = Pick<NodeServiceContext, 'deckDir' | 'workspaceRoot' | 'config' | 'settings' | 'operatorDir' | 'log' | 'secret' | 'service'>

export function createDeckSpeech(ctx: DeckSpeechContext): { core: SpeechCore, speech: CachedSpeech } {
  const core = speechCore({ names: () => Object.keys(process.env), secret: name => ctx.secret(name), settings: ctx.settings, operatorDir: ctx.operatorDir, log: ctx.log })
  const cache = new SynthesisCache(ctx.deckDir, ctx.workspaceRoot, () => ctx.service?.(DOCUMENT_FILES))
  return { core, speech: new CachedSpeech(core, cache, deckSpeechConfig(ctx.config).config) }
}
