import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ModelAccess } from '../domain/index.ts'

const require = createRequire(import.meta.url)

export type Template = 'presmium'

export function templateFile(template: Template = 'presmium'): string {
  return fileURLToPath(new URL(`../../dsh/${template}.cordis.yml`, import.meta.url))
}

function dshManifest(): { file: string, bin?: string | Record<string, string>, version?: string } | undefined {
  try {
    const file = require.resolve('@deepseek-ai/dsh/package.json')
    return { file, ...JSON.parse(readFileSync(file, 'utf8')) as { bin?: string | Record<string, string>, version?: string } }
  } catch {
    return undefined
  }
}

export function dshBin(): string | undefined {
  const manifest = dshManifest()
  const file = typeof manifest?.bin === 'string' ? manifest.bin : manifest?.bin?.dsh
  return manifest && file ? join(dirname(manifest.file), file) : undefined
}

export function dshVersion(): string | undefined {
  return dshManifest()?.version
}

export function dshArgs(bin: string, template: Template = 'presmium'): string[] {
  return [bin, '--profile', 'acp', '--patch', templateFile(template)]
}

export function dshHome(env: NodeJS.ProcessEnv): string {
  return join(env.XDG_STATE_HOME || join(env.HOME || homedir(), '.local', 'state'), 'presmium', 'dsh')
}

const NEVER = (name: string) => name.startsWith('PRESMIUM_') || name === 'DEEPSEEK_BASE_URL'
const NOT_BUNDLED = (name: string) => NEVER(name) || name.startsWith('DSH_') || name === 'DEEPSEEK_SEARCH_BASE_URL'

function inherited(env: NodeJS.ProcessEnv, drop: (name: string) => boolean): Record<string, string> {
  return Object.fromEntries(Object.entries(env).filter((entry): entry is [string, string] => entry[1] !== undefined && !drop(entry[0])))
}

export function replacementEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  return inherited(env, NEVER)
}

export const MODEL_VARIABLE = 'DSH_PRESMIUM_MODEL'

export function localEnv(env: NodeJS.ProcessEnv, access: ModelAccess): Record<string, string> {
  const out = inherited(env, NOT_BUNDLED)
  if (access.kind === 'custom') {
    out.DEEPSEEK_BASE_URL = access.url
    out.DEEPSEEK_SEARCH_BASE_URL = `${access.url.replace(/\/+$/, '').replace(/\/v1$/, '')}/v1`
  }
  out.DEEPSEEK_API_KEY = access.key
  if (access.model) out[MODEL_VARIABLE] = access.model
  out.DSH_TELEMETRY_MODE = 'DISABLED'
  out.DSH_HOME = dshHome(env)
  out.DSH_AGENTS_HOME = join(out.DSH_HOME, 'agents')
  return out
}
