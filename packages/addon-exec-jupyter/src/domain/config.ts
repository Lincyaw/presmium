import { isRecord } from '@lincyaw/kernel'
import type { EnvironmentAuth, EnvironmentSpec } from '@lincyaw/kernel'

export const EXEC_JUPYTER_ID = 'presmium.execJupyter'

export const JUPYTER_KIND = 'jupyter'

export const DEFAULT_JUPYTER_KERNEL = 'python3'

export const DEFAULT_TIMEOUT_MS = 60_000

export const RUNS_DIR = 'presmium-runs'

export const DEFAULT_TERMINAL_ROWS = 16

export function envKey(name: string): string {
  return name.toUpperCase().replace(/[^A-Z0-9]/g, '_')
}

export function operatorVariables(name: string): { url: string, token: string } {
  const key = envKey(name)
  return { url: `PRESMIUM_ENV_${key}_URL`, token: `PRESMIUM_ENV_${key}_TOKEN` }
}

export function proxyPath(name: string): string {
  return `env/${envKey(name).toLowerCase()}`
}

export function cleanupPath(name: string): string {
  return `cleanup/${envKey(name).toLowerCase()}`
}

export function preparePath(name: string): string {
  return `prepare/${envKey(name).toLowerCase()}`
}

export function authOf(spec: EnvironmentSpec): EnvironmentAuth {
  const auth = spec.auth
  return auth === 'none' || auth === 'proxy' || auth === 'prompt' || auth === 'hub' ? auth : 'env'
}

/** The name of the Jupyter kernel the environment asks for (`kernel` of the headmatter). */
export function jupyterKernelName(spec: EnvironmentSpec): string {
  return typeof spec.kernel === 'string' && spec.kernel.trim() ? spec.kernel.trim() : DEFAULT_JUPYTER_KERNEL
}

export function languagesOf(spec: EnvironmentSpec): string[] | undefined {
  return Array.isArray(spec.languages) ? spec.languages.filter((l): l is string => typeof l === 'string') : undefined
}

/** The `kind: jupyter` environments among those of the headmatter. */
export function jupyterSpecs(environments: unknown): Record<string, EnvironmentSpec> {
  if (!isRecord(environments)) return {}
  return Object.fromEntries(Object.entries(environments).filter((entry): entry is [string, EnvironmentSpec] => isRecord(entry[1]) && entry[1].kind === JUPYTER_KIND))
}

export function originOf(url: string | undefined): string | undefined {
  if (!url) return undefined
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.origin : undefined
  } catch {
    return undefined
  }
}

export function baseUrl(url: string): string {
  return url.endsWith('/') ? url : `${url}/`
}
