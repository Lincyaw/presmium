export const ASSISTANT_ID = 'presmium.assistant'

export const DEEPSEEK_PROVIDER = 'DeepSeek'

export type ModelAccess =
  | { kind: 'deepseek', provider: string, key: string, model?: string }
  | { kind: 'custom', provider: string, url: string, key: string, model?: string }

export interface ModelSettings {
  provider?: string
  url?: string
  key?: string
  model?: string
}

export type MissingItem =
  | { code: 'model', variables?: string[] }
  | { code: 'provider' }
  | { code: 'harness' }

export function missingSentence(item: MissingItem): string {
  switch (item.code) {
    case 'model': return `no model access: fill in the model settings in the page, or set DEEPSEEK_API_KEY, or PRESMIUM_MODEL_URL, PRESMIUM_MODEL_KEY and PRESMIUM_MODEL_PROVIDER${item.variables ? ` (${partialProblem(item.variables)})` : ''} and restart; or a replacement runtime with PRESMIUM_AGENT_COMMAND and PRESMIUM_AGENT_PROVIDER`
    case 'provider': return 'a replacement runtime (PRESMIUM_AGENT_COMMAND or settings.presmium.assistant.command) needs its model\'s provider: PRESMIUM_AGENT_PROVIDER or settings.presmium.assistant.provider'
    case 'harness': return 'the bundled DeepSeek Harness is not installed'
  }
}

export interface ModelSettingsView {
  source: RuntimeSource | 'none'
  provider?: string
  from?: string[]
  missing?: MissingItem
  saved: { provider?: string, url?: string, model?: string, key: boolean }
  file: string
}

export type RuntimeSource = 'environment' | 'workspace' | 'page'

type Secret = (name: string) => string | undefined

const MODEL_VARIABLES = ['PRESMIUM_MODEL_URL', 'PRESMIUM_MODEL_KEY', 'PRESMIUM_MODEL_PROVIDER'] as const

const text = (value: unknown, max = 2000) => (typeof value === 'string' && value.trim() && value.length <= max ? value.trim() : undefined)

function partialProblem(unset: string[]): string {
  return `${MODEL_VARIABLES.join(', ')} go together; ${unset.join(' and ')} ${unset.length > 1 ? 'are' : 'is'} missing`
}

export function modelAccess(secret: Secret): { access?: ModelAccess, from?: string[], unset?: string[] } {
  const [url, key, provider] = MODEL_VARIABLES.map(name => secret(name)?.trim() || undefined)
  if (url && key && provider) return { access: { kind: 'custom', provider, url, key }, from: [...MODEL_VARIABLES] }
  const missing = MODEL_VARIABLES.filter((_, i) => ![url, key, provider][i])
  const unset = missing.length < MODEL_VARIABLES.length ? { unset: missing } : {}
  const deepseek = secret('DEEPSEEK_API_KEY')?.trim()
  if (deepseek) return { access: { kind: 'deepseek', provider: DEEPSEEK_PROVIDER, key: deepseek }, from: ['DEEPSEEK_API_KEY'], ...unset }
  return unset
}

export function modelSettingsOf(value: unknown): ModelSettings | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const given = value as Record<string, unknown>
  const settings: ModelSettings = {}
  for (const name of ['provider', 'url', 'key', 'model'] as const) {
    const found = text(given[name])
    if (found) settings[name] = found
  }
  return settings
}

export function modelSettingsProblem(settings: ModelSettings): string | undefined {
  if (settings.url !== undefined) {
    let url: URL
    try {
      url = new URL(settings.url)
    } catch {
      return 'the address is not a URL'
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return 'the address is not an http(s) URL'
    if (!settings.provider) return 'a Messages-compatible address needs its provider\'s name'
  }
  if (settings.model !== undefined && !/^[\w.:/@+-]{1,200}$/.test(settings.model)) return 'the model\'s name has characters a model id does not'
  return undefined
}

export function sameService(a: ModelSettings, b: ModelSettings): boolean {
  const service = (s: ModelSettings) => [s.url ?? '', s.provider ?? (s.url ? '' : DEEPSEEK_PROVIDER)].join('\n')
  return service(a) === service(b)
}

export function savedAccess(settings: ModelSettings | undefined): ModelAccess | undefined {
  if (!settings?.key || modelSettingsProblem(settings)) return undefined
  const model = settings.model ? { model: settings.model } : {}
  return settings.url
    ? { kind: 'custom', provider: settings.provider!, url: settings.url, key: settings.key, ...model }
    : { kind: 'deepseek', provider: settings.provider ?? DEEPSEEK_PROVIDER, key: settings.key, ...model }
}

export function splitCommand(line: string): string[] {
  const words: string[] = []
  let word = ''
  let quote: string | undefined
  let started = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!
    if (quote) {
      if (c === quote) quote = undefined
      else if (c === '\\' && quote === '"' && i + 1 < line.length) word += line[++i]
      else word += c
    } else if (c === '"' || c === '\'') {
      quote = c
      started = true
    } else if (c === '\\' && i + 1 < line.length) {
      word += line[++i]
      started = true
    } else if (/\s/.test(c)) {
      if (started) words.push(word)
      word = ''
      started = false
    } else {
      word += c
      started = true
    }
  }
  if (started) words.push(word)
  return words
}

function commandOf(value: unknown): string[] | undefined {
  if (typeof value === 'string' && value.trim()) return splitCommand(value.trim())
  if (Array.isArray(value) && value.length && value.every(word => typeof word === 'string')) return value as string[]
  return undefined
}

export type RuntimeChoice =
  | { kind: 'replacement', provider: string, command: string[], source: RuntimeSource, from: string[] }
  | { kind: 'bundled', access: ModelAccess, source: RuntimeSource, from: string[], problem?: string }
  | { kind: 'none', missing: MissingItem }

export function runtimeChoice(secret: Secret, settings: Record<string, unknown>, saved?: ModelSettings): RuntimeChoice {
  const fromEnv = commandOf(secret('PRESMIUM_AGENT_COMMAND'))
  const command = fromEnv ?? commandOf(settings.command)
  if (command) {
    const provider = (typeof settings.provider === 'string' && settings.provider.trim()) || secret('PRESMIUM_AGENT_PROVIDER')?.trim()
    if (!provider) return { kind: 'none', missing: { code: 'provider' } }
    return { kind: 'replacement', provider, command, source: fromEnv ? 'environment' : 'workspace', from: fromEnv ? ['PRESMIUM_AGENT_COMMAND'] : ['settings.presmium.assistant.command'] }
  }
  const { access, from, unset } = modelAccess(secret)
  if (access) return { kind: 'bundled', access, source: 'environment', from: from!, ...unset ? { problem: partialProblem(unset) } : {} }
  const page = savedAccess(saved)
  if (page) return { kind: 'bundled', access: page, source: 'page', from: [] }
  return { kind: 'none', missing: { code: 'model', ...unset ? { variables: unset } : {} } }
}

export function choiceProvider(choice: RuntimeChoice): string | undefined {
  return choice.kind === 'none' ? undefined : choice.kind === 'replacement' ? choice.provider : choice.access.provider
}
