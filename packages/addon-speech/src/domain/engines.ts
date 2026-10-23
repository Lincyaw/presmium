import { speechEngineId } from '@lincyaw/kernel'
import type { SpeechEngineInfo } from '@lincyaw/kernel'

export const VOLCENGINE = 'volcengine'
export const FAKE = 'fake'

export type EngineKind = 'volcengine' | 'openai' | 'fake'

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

const SUFFIXES = ['URL', 'PROVIDER', 'KEY', 'APPID', 'MODEL', 'TRANSCRIBE_MODEL'] as const
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
    if (match && match[2] !== 'MODEL' && match[2] !== 'TRANSCRIBE_MODEL') ids.add(speechEngineId(match[1]!))
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

export function operatorEngines(names: Iterable<string>, secret: (name: string) => string | undefined): { engines: EngineDefinition[], unavailable: UnavailableEngine[] } {
  const engines: EngineDefinition[] = []
  const unavailable: UnavailableEngine[] = []
  for (const id of engineIds(names)) {
    const value = (suffix: Suffix) => secret(engineVariable(id, suffix))?.trim() || undefined
    if (id === VOLCENGINE) {
      const key = value('KEY')
      if (!key) unavailable.push({ id, reason: `${engineVariable(id, 'KEY')} is not set` })
      else engines.push({ id, kind: 'volcengine', url: VOLCENGINE_URL, provider: '火山引擎', key, appid: value('APPID'), model: 'seed-tts-2.0', transcribeModel: 'volc.bigasr.auc_turbo', synthesizes: true, transcribes: true })
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
  engines.sort((a, b) => Number(b.id === VOLCENGINE) - Number(a.id === VOLCENGINE) || a.id.localeCompare(b.id))
  return { engines, unavailable }
}

function isChinese(lang: string | undefined): boolean {
  return /^zh\b/i.test((lang ?? '').trim())
}

export function providerName(engine: EngineDefinition, lang?: string): string {
  if (engine.kind !== 'volcengine') return engine.provider
  return isChinese(lang ?? 'zh') ? '火山引擎' : 'Volcengine'
}

export function engineInfo(engine: EngineDefinition, lang?: string): SpeechEngineInfo {
  return {
    id: engine.id,
    provider: providerName(engine, lang),
    stt: engine.transcribes,
    tts: engine.synthesizes,
    wordTimes: engine.kind !== 'openai',
    local: engine.kind === 'fake' || (engine.kind === 'openai' && isLoopback(engine.url)),
  }
}
