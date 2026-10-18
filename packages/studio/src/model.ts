/**
 * The model of `presmium studio` (docs/design-dsh.md 11.3): the workbench uses
 * DeepSeek Harness's model settings only. The environment the author starts
 * studio with maps to DeepSeek Harness's variables by the rules of the
 * assistant of `presmium serve`:
 *
 * - `PRESMIUM_MODEL_URL`, `PRESMIUM_MODEL_KEY` and `PRESMIUM_MODEL_PROVIDER`
 *   together: a Messages-compatible service, `DEEPSEEK_BASE_URL` and
 *   `DEEPSEEK_API_KEY` (and the web search's address,
 *   `DEEPSEEK_SEARCH_BASE_URL`, which takes the same key, is that service too);
 * - else `DEEPSEEK_API_KEY` as it is, for DeepSeek's official address only: a
 *   `DEEPSEEK_BASE_URL` of the author's shell is never inherited, so a key
 *   goes to its own service.
 *
 * The model settings of the old workbench (`$XDG_CONFIG_HOME/presmium/assistant.json`)
 * can be imported once (the file stays): the key into DeepSeek Harness's home
 * `.env`, the lowest of its credential layers (the environment and a key saved
 * in the model settings come first); a service's address, which DeepSeek
 * Harness takes from the launching environment only (never from a `.env`), into
 * studio's own state, `presmium-studio.json`, and from there into the
 * environment of each start that names no model.
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const MODEL_VARIABLES = ['PRESMIUM_MODEL_URL', 'PRESMIUM_MODEL_KEY', 'PRESMIUM_MODEL_PROVIDER'] as const

/** DeepSeek Harness's variables of a model service, and what the author should know about them. */
export interface ModelEnv {
  env: Record<string, string>
  /** Which variables of the environment gave it; empty when the environment names no model. */
  from: string[]
  /** A problem with the variables (a partial `PRESMIUM_MODEL_*` triple), in English. */
  warning?: string
}

/** What studio keeps in DeepSeek Harness's home: the author's answer about the import, and the imported service's address. */
interface StudioState {
  assistantImport?: 'imported' | 'declined'
  url?: string
}

const stateFile = (dshHome: string) => join(dshHome, 'presmium-studio.json')

function readState(dshHome: string): StudioState {
  try {
    return JSON.parse(readFileSync(stateFile(dshHome), 'utf8')) as StudioState
  } catch {
    return {}
  }
}

/** The search's address on a Messages-compatible service: its root with `/v1`. */
const searchUrl = (url: string) => `${url.replace(/\/+$/, '').replace(/\/v1$/, '')}/v1`

/** A service's address as DeepSeek Harness's variables. */
const service = (url: string) => ({ DEEPSEEK_BASE_URL: url, DEEPSEEK_SEARCH_BASE_URL: searchUrl(url) })

/** The model of the environment as DeepSeek Harness's variables; without one, the address imported into `dshHome`. */
export function modelEnv(env: NodeJS.ProcessEnv, dshHome?: string): ModelEnv {
  const [url, key, provider] = MODEL_VARIABLES.map(name => env[name]?.trim() || undefined)
  if (url && key && provider) return { env: { ...service(url), DEEPSEEK_API_KEY: key }, from: [...MODEL_VARIABLES] }
  const unset = MODEL_VARIABLES.filter((_, i) => ![url, key, provider][i])
  const warning = unset.length < MODEL_VARIABLES.length ? { warning: `${MODEL_VARIABLES.join(', ')} go together; ${unset.join(' and ')} ${unset.length > 1 ? 'are' : 'is'} not set` } : {}
  const deepseek = env.DEEPSEEK_API_KEY?.trim()
  if (deepseek) return { env: { DEEPSEEK_API_KEY: deepseek }, from: ['DEEPSEEK_API_KEY'], ...warning }
  const imported = dshHome ? readState(dshHome).url : undefined
  return { env: imported ? service(imported) : {}, from: [], ...warning }
}

/** The old workbench's model settings, as `presmium serve`'s assistant saved them. */
export interface AssistantSettings {
  file: string
  provider?: string
  url?: string
  key: string
  model?: string
}

/** The file of the old workbench's model settings. */
export function assistantFile(env: NodeJS.ProcessEnv): string {
  return join(env.XDG_CONFIG_HOME || join(env.HOME || homedir(), '.config'), 'presmium', 'assistant.json')
}

/** A value a dotenv line can carry in double quotes as it is. */
const plain = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '' && !/["\\\n\r]/.test(value)

/** The old workbench's model settings with a key; undefined without the file or a key. */
export function readAssistantSettings(env: NodeJS.ProcessEnv): AssistantSettings | undefined {
  const file = assistantFile(env)
  try {
    const saved = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
    if (!plain(saved.key) || (saved.url !== undefined && !plain(saved.url))) return undefined
    return {
      file,
      key: saved.key.trim(),
      ...plain(saved.url) ? { url: saved.url.trim() } : {},
      ...plain(saved.provider) ? { provider: saved.provider.trim() } : {},
      ...plain(saved.model) ? { model: saved.model.trim() } : {},
    }
  } catch {
    return undefined
  }
}

/** Whether the author has been asked about the import already. */
export function importAnswered(dshHome: string): boolean {
  return readState(dshHome).assistantImport !== undefined
}

/**
 * Keeps the author's answer; with `settings`, imports them: the key into
 * DeepSeek Harness's home `.env` (0600), unless it has a key already, and the
 * service's address into studio's state. Returns whether the import happened.
 */
export function answerImport(dshHome: string, settings: AssistantSettings | undefined): boolean {
  mkdirSync(dshHome, { recursive: true, mode: 0o700 })
  const file = join(dshHome, '.env')
  const existing = existsSync(file) ? readFileSync(file, 'utf8') : ''
  const imported = settings !== undefined && !/^\s*(?:export\s+)?DEEPSEEK_API_KEY\s*=/m.test(existing)
  if (imported) {
    const lines = [`# The key of presmium serve's assistant (${settings.file}), imported by presmium studio.`, `DEEPSEEK_API_KEY="${settings.key}"`]
    writeFileSync(file, `${existing}${existing && !existing.endsWith('\n') ? '\n' : ''}${lines.join('\n')}\n`, { mode: 0o600 })
    chmodSync(file, 0o600)
  }
  const state: StudioState = { assistantImport: imported ? 'imported' : 'declined', ...imported && settings.url ? { url: settings.url } : {} }
  writeFileSync(stateFile(dshHome), `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 })
  return imported
}
