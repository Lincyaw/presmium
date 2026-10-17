/**
 * How the assistant starts an agent (D11, D15, docs/architecture.md 4.8):
 * the bundled DeepSeek Harness from this package's own dependency (`dsh
 * --profile acp --patch <template>`), or the operator's replacement
 * command. The agent's environment never has Presmium's variables nor a
 * `DEEPSEEK_BASE_URL` of the process: it gets the rest, and the bundled
 * DeepSeek Harness the model access.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ModelAccess } from '../domain/index.ts'

const require = createRequire(import.meta.url)

/** The DeepSeek Harness patch of this package (`dsh/`). */
export type Template = 'presmium'

export function templateFile(template: Template = 'presmium'): string {
  return fileURLToPath(new URL(`../../dsh/${template}.cordis.yml`, import.meta.url))
}

/** The bundled DeepSeek Harness's package manifest; undefined when it is not installed. */
function dshManifest(): { file: string, bin?: string | Record<string, string>, version?: string } | undefined {
  try {
    const file = require.resolve('@deepseek-ai/dsh/package.json')
    return { file, ...JSON.parse(readFileSync(file, 'utf8')) as { bin?: string | Record<string, string>, version?: string } }
  } catch {
    return undefined
  }
}

/** The bundled DeepSeek Harness's launcher (`bin.dsh`), resolved from this package; undefined when it is not installed. */
export function dshBin(): string | undefined {
  const manifest = dshManifest()
  const file = typeof manifest?.bin === 'string' ? manifest.bin : manifest?.bin?.dsh
  return manifest && file ? join(dirname(manifest.file), file) : undefined
}

/** The bundled DeepSeek Harness's version, for the start-up line. */
export function dshVersion(): string | undefined {
  return dshManifest()?.version
}

/** The arguments of `node <bin>` for a session. */
export function dshArgs(bin: string, template: Template = 'presmium'): string[] {
  return [bin, '--profile', 'acp', '--patch', templateFile(template)]
}

/**
 * DeepSeek Harness's home (profiles, sessions, its own credentials): one of
 * Presmium's in the user's state directory, so neither the user's own
 * patches (which could turn the session-log upload or telemetry back on) nor
 * the credentials stored there (which come before the environment) apply.
 */
export function dshHome(env: NodeJS.ProcessEnv): string {
  return join(env.XDG_STATE_HOME || join(env.HOME || homedir(), '.local', 'state'), 'presmium', 'dsh')
}

/** What no agent's environment inherits: Presmium's variables and the model's address. */
const NEVER = (name: string) => name.startsWith('PRESMIUM_') || name === 'DEEPSEEK_BASE_URL'
/** What the bundled DeepSeek Harness does not inherit either: the search's address, its own settings (those of the process's user). */
const NOT_BUNDLED = (name: string) => NEVER(name) || name.startsWith('DSH_') || name === 'DEEPSEEK_SEARCH_BASE_URL'

function inherited(env: NodeJS.ProcessEnv, drop: (name: string) => boolean): Record<string, string> {
  return Object.fromEntries(Object.entries(env).filter((entry): entry is [string, string] => entry[1] !== undefined && !drop(entry[0])))
}

/** A replacement runtime's environment: the process's, without Presmium's variables; it uses its own credentials. */
export function replacementEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  return inherited(env, NEVER)
}

/** The variable the template reads the model's name from (`dsh/presmium.cordis.yml`). */
export const MODEL_VARIABLE = 'DSH_PRESMIUM_MODEL'

/**
 * The bundled DeepSeek Harness's environment. A DeepSeek key goes as it
 * is, without a base URL (DeepSeek's official address only); a
 * Messages-compatible service's address and key (`PRESMIUM_MODEL_URL` and
 * `PRESMIUM_MODEL_KEY`, or the page's model settings) become
 * `DEEPSEEK_BASE_URL` and `DEEPSEEK_API_KEY`, and the web search's address
 * (`DEEPSEEK_SEARCH_BASE_URL`, which takes the same key) is that service too.
 * The model's name, when one is set, goes to the template.
 */
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
  return out
}
