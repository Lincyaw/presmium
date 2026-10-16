/**
 * The engines the operator defines (docs/ir.md 2.1, docs/architecture.md
 * section 11), from the environment of the process that holds the
 * credentials (`presmium` in LOCAL mode, `presmium gateway` in SHARED mode):
 *
 * - `volcengine`: address and provider fixed (火山引擎, Volcengine in
 *   English); `PRESMIUM_SPEECH_VOLCENGINE_KEY` and, for a key of the old
 *   console, `PRESMIUM_SPEECH_VOLCENGINE_APPID`.
 * - any other id: an engine of the OpenAI audio API shape at
 *   `PRESMIUM_SPEECH_<ID>_URL`, named `PRESMIUM_SPEECH_<ID>_PROVIDER`
 *   (required), with the optional credential `PRESMIUM_SPEECH_<ID>_KEY`,
 *   which goes to that address only, and the optional models
 *   `PRESMIUM_SPEECH_<ID>_MODEL` and `_TRANSCRIBE_MODEL`. An engine without
 *   its address or provider is unavailable, and the reason names the missing
 *   variable. `fake` is the deterministic fake engine (`presmium-speech fake`).
 */
import type { SpeechEngineInfo } from '@presmium/kernel'

export const VOLCENGINE = 'volcengine'
export const FAKE = 'fake'

export type EngineKind = 'volcengine' | 'openai' | 'fake'

export interface EngineDefinition {
  id: string
  kind: EngineKind
  /** The base address: the OpenAI shape's `…/v1`, Volcengine's fixed host. */
  url: string
  /** The service provider's name, which the UI shows (N-08); Volcengine's is chosen by language. */
  provider: string
  key?: string
  /** Volcengine, a key of the old console: the app id. */
  appid?: string
  /** The synthesis model (Volcengine: the resource id). */
  model: string
  /** The transcription model (Volcengine: the resource id of the flash recognition). */
  transcribeModel: string
}

export interface UnavailableEngine {
  id: string
  reason: string
}

/** Volcengine's fixed address (the adapter adds the paths of its interfaces). */
export const VOLCENGINE_URL = 'https://openspeech.bytedance.com'

const SUFFIXES = ['URL', 'PROVIDER', 'KEY', 'APPID', 'MODEL', 'TRANSCRIBE_MODEL'] as const
type Suffix = typeof SUFFIXES[number]
const VARIABLE = new RegExp(`^PRESMIUM_SPEECH_([A-Z0-9_]+?)_(${SUFFIXES.join('|')})$`)

/**
 * An engine's id as its variables write it, in lower case: a deck's
 * `my-engine` or `My_Engine` is the engine `my_engine` of
 * `PRESMIUM_SPEECH_MY_ENGINE_URL`.
 */
export function engineId(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]/g, '_')
}

/** `PRESMIUM_SPEECH_<ID>_<SUFFIX>` of an engine id (`my-engine` is `MY_ENGINE`). */
export function engineVariable(id: string, suffix: Suffix): string {
  return `PRESMIUM_SPEECH_${engineId(id).toUpperCase()}_${suffix}`
}

/** How the operator defines an engine, for messages. */
export function howToDefine(id: string): string {
  return `the operator defines engine "${id}" in the environment of the process that holds the credentials (${engineVariable(id, 'URL')}, ${engineVariable(id, 'PROVIDER')} and optionally ${engineVariable(id, 'KEY')}; ${VOLCENGINE} needs only ${engineVariable(VOLCENGINE, 'KEY')})`
}

/** The engine ids the environment's variable names mention, in lower case. */
export function engineIds(names: Iterable<string>): string[] {
  const ids = new Set<string>()
  for (const name of names) {
    const match = VARIABLE.exec(name)
    if (match && match[2] !== 'MODEL' && match[2] !== 'TRANSCRIBE_MODEL') ids.add(engineId(match[1]!))
  }
  return [...ids].sort()
}

function loopback(url: string): boolean {
  try {
    return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname)
  } catch {
    return false
  }
}

/**
 * The engines `names` (the environment's variable names) define, with the
 * values `secret` gives; those that lack a variable are unavailable.
 */
export function operatorEngines(names: Iterable<string>, secret: (name: string) => string | undefined): { engines: EngineDefinition[], unavailable: UnavailableEngine[] } {
  const engines: EngineDefinition[] = []
  const unavailable: UnavailableEngine[] = []
  for (const id of engineIds(names)) {
    const value = (suffix: Suffix) => secret(engineVariable(id, suffix))?.trim() || undefined
    if (id === VOLCENGINE) {
      const key = value('KEY')
      if (!key) unavailable.push({ id, reason: `${engineVariable(id, 'KEY')} is not set` })
      else engines.push({ id, kind: 'volcengine', url: VOLCENGINE_URL, provider: '火山引擎', key, appid: value('APPID'), model: 'seed-tts-2.0', transcribeModel: 'volc.bigasr.auc_turbo' })
      continue
    }
    const missing = (['URL', 'PROVIDER'] as const).filter(suffix => !value(suffix)).map(suffix => engineVariable(id, suffix))
    if (missing.length) {
      unavailable.push({ id, reason: `${missing.join(' and ')} ${missing.length > 1 ? 'are' : 'is'} not set; an engine needs its address and the name of its provider` })
      continue
    }
    const url = value('URL')!.replace(/\/+$/, '')
    try {
      const protocol = new URL(url).protocol
      if (protocol !== 'http:' && protocol !== 'https:') throw new Error(protocol)
    } catch {
      unavailable.push({ id, reason: `${engineVariable(id, 'URL')} is not an http(s) address` })
      continue
    }
    const fake = id === FAKE
    engines.push({
      id,
      kind: fake ? 'fake' : 'openai',
      url,
      provider: value('PROVIDER')!,
      key: value('KEY'),
      model: value('MODEL') ?? (fake ? 'fake-tts' : 'tts-1'),
      transcribeModel: value('TRANSCRIBE_MODEL') ?? (fake ? 'fake-stt' : 'whisper-1'),
    })
  }
  // Volcengine first, as the default engine of a deck that names none.
  engines.sort((a, b) => Number(b.id === VOLCENGINE) - Number(a.id === VOLCENGINE) || a.id.localeCompare(b.id))
  return { engines, unavailable }
}

/** Whether a UI language (an `Accept-Language` value or a tag) is Chinese. */
function chinese(lang: string | undefined): boolean {
  return /^zh\b/i.test((lang ?? '').trim())
}

/** The provider's name in a UI language: Volcengine's is 火山引擎 in Chinese, Volcengine otherwise. */
export function providerName(engine: EngineDefinition, lang?: string): string {
  if (engine.kind !== 'volcengine') return engine.provider
  return chinese(lang ?? 'zh') ? '火山引擎' : 'Volcengine'
}

/** What the engine list says of an engine. */
export function engineInfo(engine: EngineDefinition, lang?: string): SpeechEngineInfo {
  return {
    id: engine.id,
    provider: providerName(engine, lang),
    stt: true,
    tts: true,
    // Volcengine's subtitles and the fake engine give times per character; the OpenAI shape gives none.
    wordTimes: engine.kind !== 'openai',
    local: engine.kind === 'fake' || (engine.kind === 'openai' && loopback(engine.url)),
  }
}
