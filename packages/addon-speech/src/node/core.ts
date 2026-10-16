/**
 * Speech with the engines of this process's environment: `presmium` in
 * LOCAL mode, `presmium gateway` in SHARED mode (D13). Picks the engine (an
 * engine the operator did not define gets no request), checks a cloned
 * voice's consent (./consent.ts) before synthesizing, applies the
 * pronunciation lexicon to the text (words come back in the written form),
 * and labels the audio as AI-generated (./audio/label.ts).
 */
import type { Logger, SynthesisRequest, TranscriptionRequest, VoiceInfo } from '@presmium/kernel'
import type { EngineDefinition } from '../domain/index.ts'
import { aigcLabel, engineId, engineInfo, howToDefine, operatorEngines, providerName, speak, writtenWords } from '../domain/index.ts'
import { audioMime, labelAudio } from './audio/label.ts'
import type { SpeechBackend, SynthesisResult } from './backend.ts'
import { cacheKey } from './backend.ts'
import { checkConsent, writeConsent } from './consent.ts'
import { engineAdapter } from './engines/index.ts'
import type { EngineAdapter } from './engines/index.ts'
import { speaks } from './engines/types.ts'
import { SpeechError } from './errors.ts'

export interface CoreOptions {
  /** The environment's variable names, which say what engines there are. */
  names(): Iterable<string>
  secret(name: string): string | undefined
  /** `settings.presmium.speech` of the workspace configuration. */
  settings: Record<string, unknown>
  /** Where consent records are (LOCAL: outside the workspace; the gateway's own). */
  operatorDir?: string
  log: Logger
}

export interface SpeechCore extends SpeechBackend {
  /** Writes a consent record into the operator directory; returns its file. */
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
  /**
   * Each engine's voices, asked once per process. A failure is not kept and
   * fails the synthesis too: whether its voice is cloned cannot be known.
   */
  const lists = new Map<string, Promise<VoiceInfo[]>>()
  const allVoices = (engine: EngineDefinition) => {
    let list = lists.get(engine.id)
    if (!list) {
      list = adapter(engine).voices(undefined, AbortSignal.timeout(30_000)).catch((error: unknown) => {
        lists.delete(engine.id)
        throw new SpeechError(502, `the voices of speech engine "${engine.id}" are not known, so a cloned voice cannot be told: ${error instanceof Error ? error.message : String(error)}`)
      })
      lists.set(engine.id, list)
    }
    return list
  }

  const pick = (id: string | undefined): EngineDefinition => {
    const { engines: list, unavailable } = engines()
    if (!id) {
      if (list[0]) return list[0]
      throw new SpeechError(400, 'no speech engine is defined, so none was asked: the operator defines one in the environment (PRESMIUM_SPEECH_<ID>_URL and PRESMIUM_SPEECH_<ID>_PROVIDER, or PRESMIUM_SPEECH_VOLCENGINE_KEY)')
    }
    const found = list.find(engine => engine.id === engineId(id))
    if (found) return found
    const reason = unavailable.find(engine => engine.id === engineId(id))?.reason
    throw new SpeechError(400, reason ? `speech engine "${id}" is unavailable: ${reason}` : `speech engine "${id}" is not defined; ${howToDefine(id)}`)
  }

  return {
    async listing(lang) {
      const { engines: list, unavailable } = engines()
      return { engines: list.map(engine => ({ ...engineInfo(engine, lang), model: engine.model, transcribeModel: engine.transcribeModel })), unavailable }
    },

    async defaultEngine() {
      return engines().engines[0]?.id
    },

    async voices(id, lang) {
      return (await allVoices(pick(id))).filter(voice => speaks(voice, lang))
    },

    async synthesize(request: SynthesisRequest, signal): Promise<SynthesisResult> {
      const engine = pick(request.engine)
      const listed = (await allVoices(engine)).find(voice => voice.id === request.voice)
      const cloned = listed?.cloned === true || adapter(engine).cloned?.(request.voice) === true
      if (cloned) checkConsent(options.operatorDir, options.settings, engine.id, request.voice)
      // The engine gets the text as spoken; the words it times are given as words of the written text.
      const spoken = speak(request.text, request.lexicon)
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
      const engine = pick(request.engine)
      const audio = new Uint8Array(await request.audio.arrayBuffer())
      return adapter(engine).transcribe({ audio, mime: audioMime(audio, request.audio.type), lang: request.lang, hints: request.hints }, signal)
    },

    registerConsent(engine, voice, record) {
      const file = writeConsent(options.operatorDir, options.settings, engine, voice, record)
      options.log.info(`consent record of voice ${voice} of engine ${engine} registered: ${file}`)
      return file
    },
  }
}

/** Logs the engines that lack a variable, naming it, once when a server or the gateway starts. */
export async function reportEngines(core: SpeechBackend, log: Logger): Promise<void> {
  const { engines, unavailable } = await core.listing('en')
  if (engines.length) log.info(`speech engines: ${engines.map(engine => `${engine.id} (${engine.provider})`).join(', ')}`)
  for (const { id, reason } of unavailable) log.warn(`speech engine ${id} is unavailable: ${reason}`)
}
