/**
 * How the assistant starts an agent (D11, D15, docs/architecture.md 4.8):
 * the bundled DeepSeek Harness from this package's own dependency (`dsh
 * --profile acp --patch <template>`), or the operator's replacement command
 * (LOCAL). The agent's environment never has Presmium's variables nor a
 * `DEEPSEEK_BASE_URL` of the process: LOCAL passes the rest and adds the
 * model access; SHARED (agent-host) passes the basic variables only, with
 * the session's token for the gateway's model proxy.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AgentMode, TrustMode } from '@presmium/kernel'
import type { ModelAccess } from '../domain/index.ts'

const require = createRequire(import.meta.url)

/** The DeepSeek Harness patches of this package (`dsh/`). */
export type Template = 'presmium' | 'presmium-shared' | 'presmium-tutor'

export function templateFile(template: Template): string {
  return fileURLToPath(new URL(`../../dsh/${template}.cordis.yml`, import.meta.url))
}

/** The template of a session: the author's by trust mode, the tutor's read-only one. */
export function templateOf(mode: AgentMode, trust: TrustMode): Template {
  return mode === 'tutor' ? 'presmium-tutor' : trust === 'shared' ? 'presmium-shared' : 'presmium'
}

/** The bundled DeepSeek Harness's launcher (`bin.dsh`), resolved from this package; undefined when it is not installed. */
export function dshBin(): string | undefined {
  try {
    const manifest = require.resolve('@deepseek-ai/dsh/package.json')
    const { bin } = JSON.parse(readFileSync(manifest, 'utf8')) as { bin?: string | Record<string, string> }
    const file = typeof bin === 'string' ? bin : bin?.dsh
    return file ? join(dirname(manifest), file) : undefined
  } catch {
    return undefined
  }
}

/** The arguments of `node <bin>` for a session. */
export function dshArgs(bin: string, template: Template): string[] {
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

/** A replacement runtime's environment (LOCAL): the process's, without Presmium's variables; it uses its own credentials. */
export function replacementEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  return inherited(env, NEVER)
}

/**
 * The bundled DeepSeek Harness's environment in LOCAL mode. `DEEPSEEK_API_KEY`
 * goes as it is, without a base URL (DeepSeek's official address only);
 * the operator's `PRESMIUM_MODEL_URL` and `PRESMIUM_MODEL_KEY` become
 * `DEEPSEEK_BASE_URL` and `DEEPSEEK_API_KEY`, and the web search's address
 * (`DEEPSEEK_SEARCH_BASE_URL`, which takes the same key) is that service too.
 */
export function localEnv(env: NodeJS.ProcessEnv, access: ModelAccess): Record<string, string> {
  const out = inherited(env, NOT_BUNDLED)
  if (access.kind === 'custom') {
    out.DEEPSEEK_BASE_URL = access.url
    out.DEEPSEEK_SEARCH_BASE_URL = `${access.url.replace(/\/+$/, '').replace(/\/v1$/, '')}/v1`
  }
  out.DEEPSEEK_API_KEY = access.key
  out.DSH_TELEMETRY_MODE = 'DISABLED'
  out.DSH_HOME = dshHome(env)
  return out
}

const BASIC = /^(?:PATH|HOME|LANG|LC_\w+|TZ|TMPDIR)$/

/** The bundled DeepSeek Harness's environment in agent-host (SHARED): the basic variables, the model proxy and the session's token. */
export function sharedEnv(env: NodeJS.ProcessEnv, model: { url: string, token: string }): Record<string, string> {
  const out = Object.fromEntries(Object.entries(env).filter((entry): entry is [string, string] => entry[1] !== undefined && BASIC.test(entry[0])))
  return { ...out, DEEPSEEK_BASE_URL: model.url, DEEPSEEK_API_KEY: model.token, DSH_TELEMETRY_MODE: 'DISABLED', DSH_HOME: dshHome(env) }
}
