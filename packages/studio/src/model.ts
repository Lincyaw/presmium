import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const MODEL_VARIABLES = ['PRESMIUM_MODEL_URL', 'PRESMIUM_MODEL_KEY', 'PRESMIUM_MODEL_PROVIDER'] as const

export interface ModelEnv {
  env: Record<string, string>
  from: string[]
  warning?: string
}

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

const searchUrl = (url: string) => `${url.replace(/\/+$/, '').replace(/\/v1$/, '')}/v1`

const service = (url: string) => ({ DEEPSEEK_BASE_URL: url, DEEPSEEK_SEARCH_BASE_URL: searchUrl(url) })

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

export interface AssistantSettings {
  file: string
  provider?: string
  url?: string
  key: string
  model?: string
}

export function assistantFile(env: NodeJS.ProcessEnv): string {
  return join(env.XDG_CONFIG_HOME || join(env.HOME || homedir(), '.config'), 'presmium', 'assistant.json')
}

const plain = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '' && !/["\\\n\r]/.test(value)

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

export function importAnswered(dshHome: string): boolean {
  return readState(dshHome).assistantImport !== undefined
}

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
