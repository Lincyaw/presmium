import { createHash } from 'node:crypto'
import { aigcLabel, remapWords, speechEngineId } from '@lincyaw/kernel'
import type { Logger, SpeechWord, SynthesisRequest, TranscriptionRequest, VoiceCatalog, VoiceCloneStatus, VoiceInfo } from '@lincyaw/kernel'
import type { EngineDefinition, EngineUse, LexiconText } from '../domain/index.ts'
import { applyLexiconWithSpans, whyEngineCannot, engineDoes, engineInfo, howToDefine, operatorEngines, providerName } from '../domain/index.ts'
import { audioMime, labelAudio } from './audio/label.ts'
import type { CloneInput, SpeechBackend, SynthesisResult } from './backend.ts'
import { cacheKey, profileCacheKey } from './cache.ts'
import { checkConsent, consentedVoices, writeConsent } from './consent.ts'
import { engineAdapter } from './engines/index.ts'
import type { EngineAdapter } from './engines/index.ts'
import { speaks } from './engines/types.ts'
import { SpeechError } from './errors.ts'

function writtenWords(words: SpeechWord[], written: string, spoken: LexiconText): SpeechWord[] {
  if (spoken.spans.length === 0) return words
  return remapWords(words, written, spoken.text, spoken.spans).map(({ text, start, end }) => ({ text: text.trim(), start, end }))
}

export interface CoreOptions {
  names(): Iterable<string>
  secret(name: string): string | undefined
  settings: Record<string, unknown>
  operatorDir?: string
  log: Logger
}

export interface SpeechCore extends SpeechBackend {
  registerConsent(engine: string, voice: string, record: unknown): string
  cloneVoice(input: CloneInput, signal?: AbortSignal): Promise<VoiceCloneStatus>
  cloneStatus(engine: string | undefined, voice: string, signal?: AbortSignal): Promise<VoiceCloneStatus>
}

interface CatalogLoad {
  promise: Promise<VoiceCatalog>
  controller: AbortController
  borrowers: number
  settled: boolean
}

export function speechCore(options: CoreOptions): SpeechCore {
  let defined: ReturnType<typeof operatorEngines> | undefined
  const engines = () => {
    if (!defined) {
      defined = operatorEngines(options.names(), options.secret)
      for (const warning of defined.warnings) options.log.warn(warning)
    }
    return defined
  }
  const profileOf = (engine: EngineDefinition, use: EngineUse) => createHash('sha256').update(JSON.stringify([
    'presmium.speech-profile/1', engine.id, engine.kind, engine.url, engine.provider, use,
    use === 'synthesize' ? engine.model : engine.transcribeModel,
  ])).digest('hex')
  const adapters = new Map<string, EngineAdapter>()
  const adapter = (engine: EngineDefinition) => {
    let found = adapters.get(engine.id)
    if (!found) adapters.set(engine.id, found = engineAdapter(engine, options.log))
    return found
  }
  const lists = new Map<string, CatalogLoad>()
  const known = new Map<string, VoiceInfo[]>()
  const unlisted = new Set<string>()
  const allCatalog = (engine: EngineDefinition, signal?: AbortSignal): Promise<VoiceCatalog> => {
    signal?.throwIfAborted()
    let list = lists.get(engine.id)
    if (!list) {
      const own = adapter(engine), controller = new AbortController(), requestSignal = AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)])
      const created: CatalogLoad = { controller, borrowers: 0, settled: false, promise: Promise.resolve().then(async () => {
        try {
          const catalog = await own.voiceCatalog(undefined, requestSignal)
          requestSignal.throwIfAborted()
          known.set(engine.id, catalog.voices)
          return catalog
        } catch (error) {
          if (lists.get(engine.id) === created) lists.delete(engine.id)
          if (controller.signal.aborted) throw controller.signal.reason
          throw new SpeechError(502, `the voices of speech engine "${engine.id}" are not known, so a cloned voice cannot be told: ${error instanceof Error ? error.message : String(error)}`)
        } finally { created.settled = true }
      }) }
      lists.set(engine.id, list = created)
    }
    const borrowed = list
    borrowed.borrowers++
    return new Promise((resolve, reject) => {
      let finished = false
      const release = () => {
        if (finished) return false
        finished = true
        signal?.removeEventListener('abort', abort)
        borrowed.borrowers--
        if (!borrowed.borrowers && !borrowed.settled) {
          if (lists.get(engine.id) === borrowed) lists.delete(engine.id)
          borrowed.controller.abort()
        }
        return true
      }
      const abort = () => { if (release()) reject(signal!.reason) }
      signal?.addEventListener('abort', abort, { once: true })
      borrowed.promise.then(catalog => { if (release()) resolve(catalog) }, error => { if (release()) reject(error) })
      if (signal?.aborted) abort()
    })
  }
  // Cloned voices with a consent record are the operator's to use even when the engine does not list them (no
  // console credentials, or a voice trained moments ago): they join the engine's list, read fresh each time.
  const withConsented = (engine: EngineDefinition, catalog: VoiceCatalog): VoiceCatalog => {
    const extra = consentedVoices(options.operatorDir, options.settings, engine.id).filter(voice => !catalog.voices.some(own => own.id === voice.id))
    return extra.length && catalog.status === 'available' ? { ...catalog, voices: [...catalog.voices, ...extra] } : catalog
  }
  const allVoices = async (engine: EngineDefinition, signal?: AbortSignal) => {
    const catalog = withConsented(engine, await allCatalog(engine, signal))
    signal?.throwIfAborted()
    return catalog.voices
  }
  const cloning = (id: string | undefined) => {
    const engine = pick(id, 'synthesize'), own = adapter(engine)
    if (!own.clone || !own.cloneStatus) throw new SpeechError(400, `speech engine "${engine.id}" cannot train cloned voices`)
    if (options.settings.cloned !== true) throw new SpeechError(403, 'cloned voices are off: the operator allows them with settings.presmium.speech.cloned: true in presmium.workspace.yaml')
    return { engine, own: own as Required<Pick<EngineAdapter, 'clone' | 'cloneStatus'>> }
  }

  // Without a name, the first engine that does the use: an engine only for saying text is not asked to transcribe.
  const pick = (id: string | undefined, use: EngineUse): EngineDefinition => {
    const { engines: list, unavailable } = engines()
    if (!id) {
      const first = list.find(engine => engineDoes(engine, use))
      if (first) return first
      if (list.length > 0) throw new SpeechError(400, `no speech engine ${use === 'synthesize' ? 'synthesizes' : 'transcribes'}: ${list.map(engine => whyEngineCannot(engine, use)).join('; ')}`)
      throw new SpeechError(400, 'no speech engine is defined, so none was asked: the operator defines one in the environment (PRESMIUM_SPEECH_<ID>_URL and PRESMIUM_SPEECH_<ID>_PROVIDER, or PRESMIUM_SPEECH_VOLCENGINE_KEY)')
    }
    const found = list.find(engine => engine.id === speechEngineId(id))
    if (found && !engineDoes(found, use)) throw new SpeechError(400, whyEngineCannot(found, use))
    if (found) return found
    const reason = unavailable.find(engine => engine.id === speechEngineId(id))?.reason
    throw new SpeechError(400, reason ? `speech engine "${id}" is unavailable: ${reason}` : `speech engine "${id}" is not defined; ${howToDefine(id)}`)
  }

  return {
    async listEngines(lang) {
      const { engines: list, unavailable } = engines()
      return { engines: list.map(engine => ({ ...engineInfo(engine, lang), model: engine.model, transcribeModel: engine.transcribeModel })), unavailable }
    },

    async defaultSynthesisEngine() {
      return engines().engines.find(engine => engine.synthesizes)?.id
    },

    async cacheProfile(id, use, lang) {
      const { engines: list, unavailable } = engines()
      const engine = id ? list.find(own => own.id === speechEngineId(id)) : list.find(own => engineDoes(own, use))
      if (engine) return engineDoes(engine, use) ? { status: 'configured', profile: profileOf(engine, use), model: use === 'synthesize' ? engine.model : engine.transcribeModel, provider: providerName(engine, lang) } : { status: 'unavailable' }
      return { status: (id ? unavailable.some(own => own.id === speechEngineId(id)) : unavailable.length > 0) ? 'unavailable' : 'absent' }
    },

    async voices(id, lang, signal) {
      return (await allVoices(pick(id, 'synthesize'), signal)).filter(voice => speaks(voice, lang))
    },

    async voiceCatalog(id, lang, signal) {
      signal?.throwIfAborted()
      const engine = id ? pick(id, 'synthesize') : engines().engines.find(engine => engine.synthesizes)
      if (!engine) return { status: 'unavailable', reason: 'not-configured', voices: [] }
      const catalog = withConsented(engine, await allCatalog(engine, signal))
      signal?.throwIfAborted()
      return { ...catalog, voices: catalog.voices.filter(voice => speaks(voice, lang)) }
    },

    async synthesize(request: SynthesisRequest, signal): Promise<SynthesisResult> {
      const engine = pick(request.engine, 'synthesize')
      const listed = (await allVoices(engine, signal)).find(voice => voice.id === request.voice)
      const cloned = listed?.cloned === true || adapter(engine).cloned?.(request.voice) === true
      if (cloned) checkConsent(options.operatorDir, options.settings, engine.id, request.voice)
      const spoken = applyLexiconWithSpans(request.text, request.lexicon)
      const requestKey = cacheKey({ ...request, engine: engine.id }, spoken.text)
      const profile = profileOf(engine, 'synthesize')
      const key = profileCacheKey(requestKey, profile)
      const produced = await adapter(engine).synthesize({ voice: request.voice, text: spoken.text, lang: request.lang, rate: request.rate, style: request.style }, signal)
      const provider = providerName(engine, request.lang)
      const label = aigcLabel(provider, key)
      const labeled = labelAudio(produced.audio, label)
      const words = produced.words?.length ? writtenWords(produced.words, request.text, spoken) : undefined
      return {
        audio: labeled.audio,
        mime: labeled.mime,
        ext: labeled.ext,
        duration: labeled.duration || produced.duration || words?.at(-1)?.end || 0,
        ...words ? { words } : {},
        engine: engine.id,
        model: engine.model,
        voice: request.voice,
        provider,
        cloned,
        key,
        requestKey,
        profile,
        AIGC: label,
      }
    },

    async transcribe(request: TranscriptionRequest, signal) {
      const engine = pick(request.engine, 'transcribe')
      const audio = new Uint8Array(await request.audio.arrayBuffer())
      return adapter(engine).transcribe({ audio, mime: audioMime(audio, request.audio.type), lang: request.lang, hints: request.hints }, signal)
    },

    async consent(engine, voice, recorded, signal) {
      signal?.throwIfAborted()
      if (!recorded) {
        const defined = engines().engines.find(own => own.id === speechEngineId(engine))
        if (!defined) return
        if (adapter(defined).cloned?.(voice) !== true) {
          const voices = known.get(defined.id) ?? (unlisted.has(defined.id)
            ? []
            : await allVoices(defined, signal).catch(() => {
              signal?.throwIfAborted()
              unlisted.add(defined.id)
              return []
            }))
          if (!voices.some(own => own.id === voice && own.cloned === true)) return
        }
      }
      checkConsent(options.operatorDir, options.settings, speechEngineId(engine), voice)
    },

    async cloneVoice(input: CloneInput, signal): Promise<VoiceCloneStatus> {
      const { engine, own } = cloning(input.engine)
      // Consent before anything leaves the machine: the record names the speaker and the scope, and holds the sha256
      // of their recorded statement, which is kept beside it.
      const statementMime = audioMime(input.consent.statement, input.consent.statementMime)
      const record = { speaker: input.consent.speaker.trim(), scope: input.consent.scope.trim(), date: new Date().toISOString(), statementSha256: createHash('sha256').update(input.consent.statement).digest('hex') }
      const file = writeConsent(options.operatorDir, options.settings, engine.id, input.voice, record, { bytes: input.consent.statement, ext: statementMime.split('/')[1]?.replace('mpeg', 'mp3').replace(/[^a-z0-9]/g, '') || 'bin' })
      options.log.info(`consent record of voice ${input.voice} of engine ${engine.id} registered: ${file}`)
      const status = await own.clone({ voice: input.voice, audio: input.sample, mime: audioMime(input.sample, input.sampleMime), ...input.lang ? { lang: input.lang } : {}, ...input.text ? { text: input.text } : {} }, signal)
      lists.delete(engine.id)
      return { engine: engine.id, voice: input.voice, ...status }
    },

    async cloneStatus(id, voice, signal): Promise<VoiceCloneStatus> {
      const { engine, own } = cloning(id)
      // Only voices trained through Presmium, with their consent, are asked about.
      checkConsent(options.operatorDir, options.settings, engine.id, voice)
      const status = await own.cloneStatus(voice, signal)
      if (status.state === 'ready') lists.delete(engine.id)
      return { engine: engine.id, voice, ...status }
    },

    registerConsent(engine, voice, record) {
      const file = writeConsent(options.operatorDir, options.settings, engine, voice, record)
      options.log.info(`consent record of voice ${voice} of engine ${engine} registered: ${file}`)
      return file
    },
  }
}

export async function reportEngines(core: SpeechBackend, log: Logger): Promise<void> {
  const { engines, unavailable } = await core.listEngines('en')
  if (engines.length) log.info(`speech engines: ${engines.map(engine => `${engine.id} (${engine.provider})`).join(', ')}`)
  for (const { id, reason } of unavailable) log.warn(`speech engine ${id} is unavailable: ${reason}`)
}
