import { DOCUMENT_FILES, speechEngineId } from '@lincyaw/kernel'
import type { NodeServiceContext, SpeechWord, SynthesisRequest, TranscriptionRequest, VoiceCatalog } from '@lincyaw/kernel'
import type { DeckSpeechConfig } from '../domain/index.ts'
import { applyLexicon, deckSpeechConfig } from '../domain/index.ts'
import type { CloneInput, SpeechBackend, SynthesisResult } from './backend.ts'
import { cacheKey, profileCacheKey, SynthesisCache } from './cache.ts'
import type { SpeechCore } from './core.ts'
import { speechCore } from './core.ts'
import { SpeechError } from './errors.ts'

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

  cacheProfile(engine: string | undefined, use: 'synthesize' | 'transcribe', lang?: string) {
    return this.#inner.cacheProfile(engine, use, lang)
  }

  /** Resolves the cache identity locally, including document defaults, without generating audio. */
  async synthesisKey(request: SynthesisRequest): Promise<string | undefined> {
    const engine = request.engine ?? await this.defaultSynthesisEngine()
    if (!engine) return undefined
    const requestKey = cacheKey({ ...request, engine: speechEngineId(engine) }, applyLexicon(request.text, request.lexicon))
    const profile = await this.cacheProfile(engine, 'synthesize')
    return profile.status === 'configured' ? profileCacheKey(requestKey, profile.profile) : profile.status === 'absent' ? this.cache.resolveRequest(requestKey) : undefined
  }

  /** Every consumer, including direct clip playback and alignment, uses this identity/SHA gate. */
  async cached(key: string) {
    const hit = await this.cache.find(key)
    if (!hit) return undefined
    const current = await this.cacheProfile(hit.record.engine, 'synthesize', hit.record.lang)
    if (current.status === 'configured') return hit.record.profile === current.profile && hit.record.model === current.model && hit.record.provider === current.provider ? hit : undefined
    return current.status === 'absent' && this.cache.locked(hit.record) ? hit : undefined
  }

  async lookup(request: SynthesisRequest) {
    const engine = request.engine ?? await this.defaultSynthesisEngine()
    const key = await this.synthesisKey({ ...request, engine })
    const hit = key ? await this.cached(key) : undefined
    return hit && hit.record.engine === speechEngineId(engine!) && hit.record.text === request.text && hit.record.lang === request.lang && hit.record.voice === request.voice ? hit : undefined
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
    const hit = await this.lookup({ ...request, engine })
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
        key: record.key,
        ...record.profile ? { profile: record.profile, requestKey: record.requestKey } : {},
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
    const hit = await this.cached(key)
    if (!hit) return undefined
    const engine = await this.#transcriptionEngine()
    const transcriber = await this.cacheProfile(engine, 'transcribe')
    const kept = this.cache.readAlignment(hit.record, options.lang, transcriber)
    if (kept) return kept
    if (options.transcribe === false || transcriber.status !== 'configured') return undefined
    try {
      const transcript = await this.#inner.transcribe({ audio: new Blob([new Uint8Array(hit.audio)], { type: hit.record.mime }), lang: options.lang, engine }, signal)
      const words = transcript.segments.flatMap(segment => segment.words)
      if (words.length === 0) return undefined
      await this.cache.writeAlignment(hit.record, options.lang, transcriber.profile, words)
      return words
    } catch {
      return undefined
    }
  }

  consent(engine: string, voice: string, recorded: boolean, signal?: AbortSignal): Promise<void> {
    return this.#inner.consent(engine, voice, recorded, signal)
  }

  async cloneVoice(input: CloneInput, signal?: AbortSignal) {
    if (!this.#inner.cloneVoice) throw new SpeechError(400, 'this speech service cannot clone voices')
    return this.#inner.cloneVoice({ ...input, engine: input.engine ?? this.#defaults.engine }, signal)
  }

  async cloneStatus(engine: string | undefined, voice: string, signal?: AbortSignal) {
    if (!this.#inner.cloneStatus) throw new SpeechError(400, 'this speech service cannot clone voices')
    return this.#inner.cloneStatus(engine ?? this.#defaults.engine, voice, signal)
  }

  async transcribe(request: TranscriptionRequest, signal?: AbortSignal) {
    const engine = request.engine ?? await this.#transcriptionEngine()
    return this.#inner.transcribe({ ...request, ...engine ? { engine } : {} }, signal)
  }
}

export type DeckSpeechContext = Pick<NodeServiceContext, 'deckDir' | 'workspaceRoot' | 'config' | 'settings' | 'operatorDir' | 'log' | 'secret' | 'service'>

export function createDeckSpeech(ctx: DeckSpeechContext): { core: SpeechCore, speech: CachedSpeech } {
  const core = speechCore({ names: () => [...new Set([...Object.keys(process.env), ...ctx.secret('PRESMIUM_SPEECH_VOLCENGINE_KEY') ? ['PRESMIUM_SPEECH_VOLCENGINE_KEY'] : []])], secret: name => ctx.secret(name), settings: ctx.settings, operatorDir: ctx.operatorDir, log: ctx.log })
  const cache = new SynthesisCache(ctx.deckDir, ctx.workspaceRoot, () => ctx.service?.(DOCUMENT_FILES))
  return { core, speech: new CachedSpeech(core, cache, deckSpeechConfig(ctx.config).config) }
}
