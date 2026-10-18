/**
 * Which agent runtime the operator configured (D11, P-111, docs/architecture.md
 * 4.8), never from the deck. In this order:
 *
 * 1. a replacement runtime: `PRESMIUM_AGENT_COMMAND`, or the setting
 *    `command` of `settings.presmium.assistant`, with its provider
 *    (`PRESMIUM_AGENT_PROVIDER` or the setting `provider`); it uses its own credentials;
 * 2. the bundled DeepSeek Harness with the model access of the environment:
 *    the three `PRESMIUM_MODEL_URL`, `PRESMIUM_MODEL_KEY` and
 *    `PRESMIUM_MODEL_PROVIDER` together, else `DEEPSEEK_API_KEY` (provider `DeepSeek`);
 * 3. the bundled DeepSeek Harness with the model settings the operator saved
 *    in the page (`ModelSettings`, in the user's configuration directory).
 *
 * The environment comes first, so a page cannot override what the operator
 * started the process with. Without any of them the assistant is unavailable
 * and starts nothing.
 */
export const ASSISTANT_ID = 'presmium.assistant'

/** The provider of `DEEPSEEK_API_KEY`, DeepSeek's official API. */
export const DEEPSEEK_PROVIDER = 'DeepSeek'

export type ModelAccess =
  /** DeepSeek's official address only. */
  | { kind: 'deepseek', provider: string, key: string, model?: string }
  /** The operator's Messages-compatible service: its key goes to its URL only. */
  | { kind: 'custom', provider: string, url: string, key: string, model?: string }

/**
 * The model settings of the page (P-111), as saved: no `url` is DeepSeek's
 * official address (provider `DeepSeek` unless named), a `url` a
 * Messages-compatible service whose provider is named. `model` is the
 * model's name; without it DeepSeek Harness's default.
 */
export interface ModelSettings {
  provider?: string
  url?: string
  key?: string
  model?: string
}

/**
 * What the operator must set while the assistant is unavailable
 * (`AssistantInfo.missing`, `ModelSettingsView.missing`): a code with its
 * parameters, which the page says in its language (N-07):
 *
 * - `model`: no model access: the page's model settings, `DEEPSEEK_API_KEY`,
 *   or the three `PRESMIUM_MODEL_*` together; `variables` are those not set
 *   of the three when some are;
 * - `provider`: a replacement runtime without its model's provider;
 * - `harness`: the bundled DeepSeek Harness is not installed.
 */
export type MissingItem =
  | { code: 'model', variables?: string[] }
  | { code: 'provider' }
  | { code: 'harness' }

/** What is missing in English, for the log and the errors of the process (the page says it in its language). */
export function missingSentence(item: MissingItem): string {
  switch (item.code) {
    case 'model': return `no model access: fill in the model settings in the page, or set DEEPSEEK_API_KEY, or PRESMIUM_MODEL_URL, PRESMIUM_MODEL_KEY and PRESMIUM_MODEL_PROVIDER${item.variables ? ` (${partialProblem(item.variables)})` : ''} and restart; or a replacement runtime with PRESMIUM_AGENT_COMMAND and PRESMIUM_AGENT_PROVIDER`
    case 'provider': return 'a replacement runtime (PRESMIUM_AGENT_COMMAND or settings.presmium.assistant.command) needs its model\'s provider: PRESMIUM_AGENT_PROVIDER or settings.presmium.assistant.provider'
    case 'harness': return 'the bundled DeepSeek Harness is not installed'
  }
}

/** What the page shows of the model settings (`GET settings`): never the key, only whether it is set. */
export interface ModelSettingsView {
  /** Where the assistant's model comes from now. */
  source: RuntimeSource | 'none'
  /** The provider in effect. */
  provider?: string
  /** The environment variables or settings in effect, by name. */
  from?: string[]
  /** What is missing, when nothing is in effect. */
  missing?: MissingItem
  /** What the page saved. */
  saved: { provider?: string, url?: string, model?: string, key: boolean }
  /** The file the page's settings are saved in. */
  file: string
}

/** Where a runtime choice comes from: the environment, the workspace's configuration, the page's model settings. */
export type RuntimeSource = 'environment' | 'workspace' | 'page'

type Secret = (name: string) => string | undefined

const MODEL_VARIABLES = ['PRESMIUM_MODEL_URL', 'PRESMIUM_MODEL_KEY', 'PRESMIUM_MODEL_PROVIDER'] as const

const text = (value: unknown, max = 2000) => (typeof value === 'string' && value.trim() && value.length <= max ? value.trim() : undefined)

/** What a partial `PRESMIUM_MODEL_*` triple lacks, in English. */
function partialProblem(unset: string[]): string {
  return `${MODEL_VARIABLES.join(', ')} go together; ${unset.join(' and ')} ${unset.length > 1 ? 'are' : 'is'} missing`
}

/** The environment's model access; `unset` names the variables a partial `PRESMIUM_MODEL_*` triple lacks. */
export function modelAccess(secret: Secret): { access?: ModelAccess, from?: string[], unset?: string[] } {
  const [url, key, provider] = MODEL_VARIABLES.map(name => secret(name)?.trim() || undefined)
  if (url && key && provider) return { access: { kind: 'custom', provider, url, key }, from: [...MODEL_VARIABLES] }
  const missing = MODEL_VARIABLES.filter((_, i) => ![url, key, provider][i])
  const unset = missing.length < MODEL_VARIABLES.length ? { unset: missing } : {}
  const deepseek = secret('DEEPSEEK_API_KEY')?.trim()
  if (deepseek) return { access: { kind: 'deepseek', provider: DEEPSEEK_PROVIDER, key: deepseek }, from: ['DEEPSEEK_API_KEY'], ...unset }
  return unset
}

/** The page's model settings from what was saved; undefined for anything else. */
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

/** Why the page's model settings cannot be saved as they are (in English; the page checks the same first). */
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

/**
 * Whether two of the page's model settings name the same service: the same
 * address (none: DeepSeek's official one) and provider. A saved key stays
 * when the page saves the settings again without one only then, so it never
 * goes to another service (P-111, N-08).
 */
export function sameService(a: ModelSettings, b: ModelSettings): boolean {
  const service = (s: ModelSettings) => [s.url ?? '', s.provider ?? (s.url ? '' : DEEPSEEK_PROVIDER)].join('\n')
  return service(a) === service(b)
}

/** The model access of the page's settings; undefined until a key is saved. */
export function savedAccess(settings: ModelSettings | undefined): ModelAccess | undefined {
  if (!settings?.key || modelSettingsProblem(settings)) return undefined
  const model = settings.model ? { model: settings.model } : {}
  return settings.url
    ? { kind: 'custom', provider: settings.provider!, url: settings.url, key: settings.key, ...model }
    : { kind: 'deepseek', provider: settings.provider ?? DEEPSEEK_PROVIDER, key: settings.key, ...model }
}

/** An argument vector from a command line: words split at spaces, quotes kept together (no shell). */
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
  /** A replacement runtime: the operator's command, its provider; it uses its own credentials. */
  | { kind: 'replacement', provider: string, command: string[], source: RuntimeSource, from: string[] }
  /** The bundled DeepSeek Harness with the operator's model access; `problem` says what of the environment's is incomplete. */
  | { kind: 'bundled', access: ModelAccess, source: RuntimeSource, from: string[], problem?: string }
  /** No runtime: `missing` says which settings are needed. */
  | { kind: 'none', missing: MissingItem }

/** The operator's choice (`settings` is `settings.presmium.assistant`, `saved` the page's model settings). */
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

/** The provider a choice names; undefined for none. */
export function choiceProvider(choice: RuntimeChoice): string | undefined {
  return choice.kind === 'none' ? undefined : choice.kind === 'replacement' ? choice.provider : choice.access.provider
}
