import { speechEngineId } from '@lincyaw/kernel'
import type { SpeechEngineInfo } from '@lincyaw/kernel'

export const VOLCENGINE = 'volcengine'
export const FAKE = 'fake'
/** Microsoft Edge's read-aloud voices: built in, free and without setup, so narration works out of the box. */
export const EDGE = 'edge'
export const EDGE_URL = 'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud'

export type EngineKind = 'volcengine' | 'openai' | 'fake' | 'edge'

export interface EngineDefinition {
  id: string
  kind: EngineKind
  url: string
  provider: string
  key?: string
  appid?: string
  model: string
  transcribeModel: string
  /** False when the operator says the engine does not synthesize (`PRESMIUM_SPEECH_<ID>_MODEL=none`). */
  synthesizes: boolean
  /** False when the operator says the engine does not transcribe (`PRESMIUM_SPEECH_<ID>_TRANSCRIBE_MODEL=none`). */
  transcribes: boolean
  /**
   * Volcengine's console (OpenAPI) credentials, an IAM access key pair separate from the speech API key: with them
   * the voice list and the account's cloned voices come from the account; without, from the bundled catalogue.
   */
  console?: { accessKeyId: string, secretAccessKey: string, project: string }
  /** Present without the operator defining it; audio committed for a request is used as is under it. */
  builtin?: boolean
}

/** The model an operator writes for a use an engine does not have, e.g. an engine that only says text. */
export const NO_MODEL = 'none'

export type EngineUse = 'synthesize' | 'transcribe'

export function engineDoes(engine: EngineDefinition, use: EngineUse): boolean {
  return use === 'synthesize' ? engine.synthesizes : engine.transcribes
}

/** Why an engine named for a use cannot do it. */
export function whyEngineCannot(engine: EngineDefinition, use: EngineUse): string {
  return `speech engine "${engine.id}" does not ${use}: ${engineVariable(engine.id, use === 'synthesize' ? 'MODEL' : 'TRANSCRIBE_MODEL')} is ${NO_MODEL}`
}

export interface UnavailableEngine {
  id: string
  reason: string
}

export const VOLCENGINE_URL = 'https://openspeech.bytedance.com'

const SUFFIXES = ['URL', 'PROVIDER', 'KEY', 'APPID', 'MODEL', 'TRANSCRIBE_MODEL', 'ACCESS_KEY_ID', 'SECRET_ACCESS_KEY', 'PROJECT'] as const
type Suffix = typeof SUFFIXES[number]
const VARIABLE = new RegExp(`^PRESMIUM_SPEECH_([A-Z0-9_]+?)_(${SUFFIXES.join('|')})$`)

export function engineVariable(id: string, suffix: Suffix): string {
  return `PRESMIUM_SPEECH_${speechEngineId(id).toUpperCase()}_${suffix}`
}

export function howToDefine(id: string): string {
  return `the operator defines engine "${id}" in the environment of the process that holds the credentials (${engineVariable(id, 'URL')}, ${engineVariable(id, 'PROVIDER')} and optionally ${engineVariable(id, 'KEY')}; ${VOLCENGINE} needs only ${engineVariable(VOLCENGINE, 'KEY')})`
}

export function engineIds(names: Iterable<string>): string[] {
  const ids = new Set<string>()
  for (const name of names) {
    const match = VARIABLE.exec(name)
    if (match) ids.add(speechEngineId(match[1]!))
  }
  return [...ids].sort()
}

function isLoopback(url: string): boolean {
  try {
    return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname)
  } catch {
    return false
  }
}

/** The engines the operator defined; `warnings` are settings that were ignored, for the operator's log. */
export function operatorEngines(names: Iterable<string>, secret: (name: string) => string | undefined): { engines: EngineDefinition[], unavailable: UnavailableEngine[], warnings: string[] } {
  const engines: EngineDefinition[] = []
  const unavailable: UnavailableEngine[] = []
  const warnings: string[] = []
  for (const id of engineIds(names)) {
    const value = (suffix: Suffix) => secret(engineVariable(id, suffix))?.trim() || undefined
    if (id === VOLCENGINE) {
      const key = value('KEY')
      const accessKeyId = value('ACCESS_KEY_ID'), secretAccessKey = value('SECRET_ACCESS_KEY')
      if (!key) unavailable.push({ id, reason: `${engineVariable(id, 'KEY')} is not set` })
      else {
        if (Boolean(accessKeyId) !== Boolean(secretAccessKey)) warnings.push(`speech engine ${id}: ${engineVariable(id, 'ACCESS_KEY_ID')} and ${engineVariable(id, 'SECRET_ACCESS_KEY')} come as a pair, and only one is set, so the voice list is the bundled one`)
        engines.push({
          id, kind: 'volcengine', url: VOLCENGINE_URL, provider: VOLCENGINE_NAME['zh-CN'], key, appid: value('APPID'), model: 'seed-tts-2.0', transcribeModel: 'volc.bigasr.auc_turbo', synthesizes: true, transcribes: true,
          ...accessKeyId && secretAccessKey ? { console: { accessKeyId, secretAccessKey, project: value('PROJECT') ?? 'default' } } : {},
        })
      }
      continue
    }
    if (id === EDGE && !value('URL') && !value('PROVIDER')) continue
    const missing = (['URL', 'PROVIDER'] as const).filter(suffix => !value(suffix)).map(suffix => engineVariable(id, suffix))
    if (missing.length) {
      unavailable.push({ id, reason: `${missing.join(' and ')} ${missing.length > 1 ? 'are' : 'is'} not set; an engine needs its address and the name of its provider` })
      continue
    }
    let url: string
    try {
      const parsed = new URL(value('URL')!)
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error('address')
      url = parsed.href.replace(/\/+$/, '')
    } catch {
      unavailable.push({ id, reason: `${engineVariable(id, 'URL')} must be an http(s) address without credentials, query or fragment` })
      continue
    }
    const fake = id === FAKE
    const none = (suffix: Suffix) => value(suffix)?.toLowerCase() === NO_MODEL
    engines.push({
      id,
      kind: fake ? 'fake' : 'openai',
      url,
      provider: value('PROVIDER')!,
      key: value('KEY'),
      model: value('MODEL') ?? (fake ? 'fake-tts' : 'tts-1'),
      transcribeModel: value('TRANSCRIBE_MODEL') ?? (fake ? 'fake-stt' : 'whisper-1'),
      synthesizes: !none('MODEL'),
      transcribes: !none('TRANSCRIBE_MODEL'),
    })
  }
  // The built-in engine, unless the operator defines engine "edge" themselves (the local bridge) or turns it off with
  // PRESMIUM_SPEECH_EDGE_MODEL=none. It comes after the operator's engines, which are the operator's choice.
  if (!engines.some(engine => engine.id === EDGE) && !unavailable.some(engine => engine.id === EDGE)) {
    const model = secret(engineVariable(EDGE, 'MODEL'))?.trim()
    if (model?.toLowerCase() !== NO_MODEL) engines.push({ id: EDGE, kind: 'edge', url: EDGE_URL, provider: EDGE_NAME['zh-CN'], model: 'edge-read-aloud', transcribeModel: NO_MODEL, synthesizes: true, transcribes: false, builtin: true })
  }
  engines.sort((a, b) => Number(b.id === VOLCENGINE) - Number(a.id === VOLCENGINE) || Number(a.builtin === true) - Number(b.builtin === true) || a.id.localeCompare(b.id))
  return { engines, unavailable, warnings }
}

const VOLCENGINE_NAME = { 'zh-CN': '火山引擎', 'en': 'Volcengine' }
const EDGE_NAME = { 'zh-CN': '微软 Edge 朗读', 'en': 'Microsoft Edge Read Aloud' }

function isChinese(lang: string | undefined): boolean {
  return /^zh\b/i.test((lang ?? '').trim())
}

export function providerName(engine: EngineDefinition, lang?: string): string {
  if (engine.kind === 'edge') return EDGE_NAME[isChinese(lang ?? 'zh') ? 'zh-CN' : 'en']
  if (engine.kind !== 'volcengine') return engine.provider
  return VOLCENGINE_NAME[isChinese(lang ?? 'zh') ? 'zh-CN' : 'en']
}

export function engineInfo(engine: EngineDefinition, lang?: string): SpeechEngineInfo {
  return {
    id: engine.id,
    provider: providerName(engine, lang),
    stt: engine.transcribes,
    tts: engine.synthesizes,
    wordTimes: engine.kind !== 'openai',
    local: engine.kind === 'fake' || (engine.kind === 'openai' && isLoopback(engine.url)),
    clone: engine.kind !== 'openai' && engine.kind !== 'edge' && engine.synthesizes,
    ...engine.kind === 'edge' ? { parameters: { rate: { min: 0.5, max: 2, step: 0.1 } } } : {},
  }
}
