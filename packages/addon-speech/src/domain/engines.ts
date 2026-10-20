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
}

export interface UnavailableEngine {
  id: string
  reason: string
}

export const VOLCENGINE_URL = 'https://openspeech.bytedance.com'

const SUFFIXES = ['URL', 'PROVIDER', 'KEY', 'APPID', 'MODEL', 'TRANSCRIBE_MODEL'] as const
type Suffix = typeof SUFFIXES[number]
const VARIABLE = new RegExp(`^PRESMIUM_SPEECH_([A-Z0-9_]+?)_(${SUFFIXES.join('|')})$`)

export function engineId(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]/g, '_')
}

export function engineVariable(id: string, suffix: Suffix): string {
  return `PRESMIUM_SPEECH_${engineId(id).toUpperCase()}_${suffix}`
}

export function howToDefine(id: string): string {
  return `the operator defines engine "${id}" in the environment of the process that holds the credentials (${engineVariable(id, 'URL')}, ${engineVariable(id, 'PROVIDER')} and optionally ${engineVariable(id, 'KEY')}; ${VOLCENGINE} needs only ${engineVariable(VOLCENGINE, 'KEY')})`
}

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
  engines.sort((a, b) => Number(b.id === VOLCENGINE) - Number(a.id === VOLCENGINE) || a.id.localeCompare(b.id))
  return { engines, unavailable }
}

function chinese(lang: string | undefined): boolean {
  return /^zh\b/i.test((lang ?? '').trim())
}

export function providerName(engine: EngineDefinition, lang?: string): string {
  if (engine.kind !== 'volcengine') return engine.provider
  return chinese(lang ?? 'zh') ? '火山引擎' : 'Volcengine'
}

export function engineInfo(engine: EngineDefinition, lang?: string): SpeechEngineInfo {
  return {
    id: engine.id,
    provider: providerName(engine, lang),
    stt: true,
    tts: true,
    wordTimes: engine.kind !== 'openai',
    local: engine.kind === 'fake' || (engine.kind === 'openai' && loopback(engine.url)),
  }
}
