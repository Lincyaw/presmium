/**
 * Which agent runtime the operator configured (D11, docs/architecture.md
 * 4.8), from the process's environment and the operator's settings
 * (`settings.presmium.assistant`), never from the deck. The bundled DeepSeek
 * Harness runs when there is model access: `DEEPSEEK_API_KEY` (provider
 * `DeepSeek`), or the three `PRESMIUM_MODEL_URL`, `PRESMIUM_MODEL_KEY` and
 * `PRESMIUM_MODEL_PROVIDER` together, which come first. A replacement
 * runtime (`PRESMIUM_AGENT_COMMAND`, `PRESMIUM_AGENT_TUTOR_COMMAND`, or the
 * settings `command` and `tutor`) replaces it and needs a
 * provider of its own (`PRESMIUM_AGENT_PROVIDER` or `provider`). Without
 * either, the assistant is unavailable and starts nothing.
 */
export const ASSISTANT_ID = 'presmium.assistant'

/** The provider of `DEEPSEEK_API_KEY`, DeepSeek's official API. */
export const DEEPSEEK_PROVIDER = 'DeepSeek'

export type ModelAccess =
  /** `DEEPSEEK_API_KEY`: DeepSeek's official address only. */
  | { kind: 'deepseek', provider: string, key: string }
  /** The operator's Messages-compatible service: its key goes to its URL only. */
  | { kind: 'custom', provider: string, url: string, key: string }

type Secret = (name: string) => string | undefined

const MODEL_VARIABLES = ['PRESMIUM_MODEL_URL', 'PRESMIUM_MODEL_KEY', 'PRESMIUM_MODEL_PROVIDER'] as const

/** The operator's model access; `problem` says what is incomplete (a partial `PRESMIUM_MODEL_*` triple). */
export function modelAccess(secret: Secret): { access?: ModelAccess, problem?: string } {
  const [url, key, provider] = MODEL_VARIABLES.map(name => secret(name)?.trim() || undefined)
  if (url && key && provider) return { access: { kind: 'custom', provider, url, key } }
  const missing = MODEL_VARIABLES.filter((_, i) => ![url, key, provider][i])
  const problem = missing.length < MODEL_VARIABLES.length ? `${MODEL_VARIABLES.join(', ')} go together; ${missing.join(' and ')} ${missing.length > 1 ? 'are' : 'is'} missing` : undefined
  const deepseek = secret('DEEPSEEK_API_KEY')?.trim()
  if (deepseek) return { access: { kind: 'deepseek', provider: DEEPSEEK_PROVIDER, key: deepseek }, ...problem ? { problem } : {} }
  return problem ? { problem } : {}
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
  /** A replacement runtime: the operator's commands, its provider; it uses its own credentials. */
  | { kind: 'replacement', provider: string, author: string[], tutor: string[] }
  /** The bundled DeepSeek Harness with the operator's model access. */
  | { kind: 'bundled', access: ModelAccess, problem?: string }
  /** No runtime: `missing` says which settings are needed. */
  | { kind: 'none', missing: string }

/** The operator's choice (`settings` is `settings.presmium.assistant`). */
export function runtimeChoice(secret: Secret, settings: Record<string, unknown>): RuntimeChoice {
  const author = commandOf(secret('PRESMIUM_AGENT_COMMAND')) ?? commandOf(settings.command)
  const tutor = commandOf(secret('PRESMIUM_AGENT_TUTOR_COMMAND')) ?? commandOf(settings.tutor)
  if (author || tutor) {
    const provider = (typeof settings.provider === 'string' && settings.provider.trim()) || secret('PRESMIUM_AGENT_PROVIDER')?.trim()
    if (!provider) return { kind: 'none', missing: 'a replacement runtime (PRESMIUM_AGENT_COMMAND, PRESMIUM_AGENT_TUTOR_COMMAND or settings.presmium.assistant.command, tutor) needs its model\'s provider: PRESMIUM_AGENT_PROVIDER or settings.presmium.assistant.provider' }
    return { kind: 'replacement', provider, author: (author ?? tutor)!, tutor: (tutor ?? author)! }
  }
  const { access, problem } = modelAccess(secret)
  if (access) return { kind: 'bundled', access, ...problem ? { problem } : {} }
  return { kind: 'none', missing: `no model access: set DEEPSEEK_API_KEY, or PRESMIUM_MODEL_URL, PRESMIUM_MODEL_KEY and PRESMIUM_MODEL_PROVIDER${problem ? ` (${problem})` : ''}; or a replacement runtime with PRESMIUM_AGENT_COMMAND and PRESMIUM_AGENT_PROVIDER` }
}
