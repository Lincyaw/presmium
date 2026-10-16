import { isRecord } from '@presmium/kernel'
import type { EnvironmentAuth, EnvironmentSpec } from '@presmium/kernel'

/** The plugin's id: its routes are under `/__presmium/presmium.execJupyter/`, its gateway contribution under `/presmium.execJupyter/`. */
export const EXEC_JUPYTER_ID = 'presmium.execJupyter'

/** The provider kind it serves (`execute.environments.<name>.kind`). */
export const JUPYTER_KIND = 'jupyter'

/** The kernel spec when the environment names none. */
export const DEFAULT_KERNEL = 'python3'

/** How long a run may take when the request names no time (ms). */
export const DEFAULT_TIMEOUT_MS = 60_000

/** Where the files of a kernel's runs go on the server, one directory per kernel (the kernel's working directory). */
export const RUNS_DIR = 'presmium-runs'

/** The terminal's rows when `{terminal}` names none. */
export const DEFAULT_TERMINAL_ROWS = 16

/** The name of an environment in its operator variables: upper case, other characters `_` (`my-gpu` → `MY_GPU`). */
export function envKey(name: string): string {
  return name.toUpperCase().replace(/[^A-Z0-9]/g, '_')
}

/**
 * The operator's pair for an environment (docs/architecture.md section 11):
 * the address `PRESMIUM_ENV_<NAME>_URL` and the token
 * `PRESMIUM_ENV_<NAME>_TOKEN`, which goes to that address only.
 */
export function operatorVariables(name: string): { url: string, token: string } {
  const key = envKey(name)
  return { url: `PRESMIUM_ENV_${key}_URL`, token: `PRESMIUM_ENV_${key}_TOKEN` }
}

/** The environment name of an operator's `PRESMIUM_ENV_<NAME>_URL`, as its proxy path names it; undefined for other variables. */
export function environmentOfVariable(variable: string): string | undefined {
  const match = /^PRESMIUM_ENV_([A-Z0-9_]+)_URL$/.exec(variable)
  return match ? match[1]!.toLowerCase() : undefined
}

/**
 * The proxy path of an environment, under the plugin's mount point in the
 * server (`/__presmium/presmium.execJupyter/env/<name>/`) and in the gateway
 * (`/presmium.execJupyter/env/<name>/`): the operator's name in lower case,
 * so serve and the gateway agree on it.
 */
export function proxyPath(name: string): string {
  return `env/${envKey(name).toLowerCase()}`
}

/** An environment's credential mode; `jupyter` defaults to `env` (docs/ir.md 2.7). */
export function authOf(spec: EnvironmentSpec): EnvironmentAuth {
  const auth = spec.auth
  return auth === 'none' || auth === 'proxy' || auth === 'prompt' || auth === 'hub' ? auth : 'env'
}

export function kernelOf(spec: EnvironmentSpec): string {
  return typeof spec.kernel === 'string' && spec.kernel.trim() ? spec.kernel.trim() : DEFAULT_KERNEL
}

/** The languages the deck says the environment runs; undefined when it names none (the kernel spec's language then decides). */
export function languagesOf(spec: EnvironmentSpec): string[] | undefined {
  return Array.isArray(spec.languages) ? spec.languages.filter((l): l is string => typeof l === 'string') : undefined
}

/** The `kind: jupyter` environments of a deck's `execute.environments`. */
export function jupyterEnvironments(environments: unknown): Record<string, EnvironmentSpec> {
  if (!isRecord(environments)) return {}
  return Object.fromEntries(Object.entries(environments).filter((entry): entry is [string, EnvironmentSpec] => isRecord(entry[1]) && entry[1].kind === JUPYTER_KIND))
}

/** The origin of a URL (`scheme://host:port`); undefined when it is not an absolute http(s) URL. */
export function originOf(url: string | undefined): string | undefined {
  if (!url) return undefined
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.origin : undefined
  } catch {
    return undefined
  }
}

/** A base URL ending with `/`, as `@jupyterlab/services` joins paths to it. */
export function baseUrl(url: string): string {
  return url.endsWith('/') ? url : `${url}/`
}
