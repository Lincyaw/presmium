import { aigcLabel, remapWords, speechEngineId } from '@lincyaw/kernel'
import type { Logger, SpeechWord, SynthesisRequest, TranscriptionRequest, VoiceCatalog, VoiceInfo } from '@lincyaw/kernel'
import type { EngineDefinition, EngineUse, LexiconText } from '../domain/index.ts'
import { applyLexiconWithSpans, whyEngineCannot, engineDoes, engineInfo, howToDefine, operatorEngines, providerName } from '../domain/index.ts'
import { audioMime, labelAudio } from './audio/label.ts'
import type { SpeechBackend, SynthesisResult } from './backend.ts'
import { cacheKey } from './cache.ts'
import { checkConsent, writeConsent } from './consent.ts'
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
}

export function speechCore(options: CoreOptions): SpeechCore {
  let defined: ReturnType<typeof operatorEngines> | undefined
  const engines = () => defined ??= operatorEngines(options.names(), options.secret)
  const adapters = new Map<string, EngineAdapter>()
  const adapter = (engine: EngineDefinition) => {
    let found = adapters.get(engine.id)
    if (!found) adapters.set(engine.id, found = engineAdapter(engine))
    return found
  }
  const lists = new Map<string, Promise<VoiceCatalog>>()
  const known = new Map<string, VoiceInfo[]>()
  const unlisted = new Set<string>()
  const allCatalog = (engine: EngineDefinition) => {
    let list = lists.get(engine.id)
    if (!list) {
      const own = adapter(engine)
      list = own.voiceCatalog(undefined, AbortSignal.timeout(30_000)).then((catalog) => {
        known.set(engine.id, catalog.voices)
        return catalog
      }, (error: unknown) => {
        lists.delete(engine.id)
        throw new SpeechError(502, `the voices of speech engine "${engine.id}" are not known, so a cloned voice cannot be told: ${error instanceof Error ? error.message : String(error)}`)
      })
      lists.set(engine.id, list)
    }
    return list
  }
  const allVoices = async (engine: EngineDefinition) => (await allCatalog(engine)).voices

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

    async voices(id, lang) {
      return (await allVoices(pick(id, 'synthesize'))).filter(voice => speaks(voice, lang))
    },

    async voiceCatalog(id, lang, signal) {
      signal?.throwIfAborted()
      const engine = id ? pick(id, 'synthesize') : engines().engines.find(engine => engine.synthesizes)
      if (!engine) return { status: 'unavailable', reason: 'not-configured', voices: [] }
      const catalog = await allCatalog(engine)
      signal?.throwIfAborted()
      return { ...catalog, voices: catalog.voices.filter(voice => speaks(voice, lang)) }
    },

    async synthesize(request: SynthesisRequest, signal): Promise<SynthesisResult> {
      const engine = pick(request.engine, 'synthesize')
      const listed = (await allVoices(engine)).find(voice => voice.id === request.voice)
      const cloned = listed?.cloned === true || adapter(engine).cloned?.(request.voice) === true
      if (cloned) checkConsent(options.operatorDir, options.settings, engine.id, request.voice)
      const spoken = applyLexiconWithSpans(request.text, request.lexicon)
      const key = cacheKey({ ...request, engine: engine.id }, spoken.text)
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
        AIGC: label,
      }
    },

    async transcribe(request: TranscriptionRequest, signal) {
      const engine = pick(request.engine, 'transcribe')
      const audio = new Uint8Array(await request.audio.arrayBuffer())
      return adapter(engine).transcribe({ audio, mime: audioMime(audio, request.audio.type), lang: request.lang, hints: request.hints }, signal)
    },

    async consent(engine, voice, recorded) {
      if (!recorded) {
        const defined = engines().engines.find(own => own.id === speechEngineId(engine))
        if (!defined) return
        if (adapter(defined).cloned?.(voice) !== true) {
          const voices = known.get(defined.id) ?? (unlisted.has(defined.id)
            ? []
            : await allVoices(defined).catch(() => {
              unlisted.add(defined.id)
              return []
            }))
          if (!voices.some(own => own.id === voice && own.cloned === true)) return
        }
      }
      checkConsent(options.operatorDir, options.settings, speechEngineId(engine), voice)
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
