import { languageId } from '@presmium/kernel'
import type { EnvironmentSpec } from '@presmium/kernel'

export const EXEC_WEBGPU_ID = 'presmium.execWebgpu'

export const WEBGPU_EXECUTOR_ID = 'presmium.webgpu'

export const DEFAULT_TIMEOUT_MS = 10_000

export const LIMITS = { maxBytes: 128 * 1024 * 1024, maxRepeat: 1000 }

export function isWgsl(lang: string): boolean {
  return languageId(lang) === 'wgsl'
}

export type AdapterChoice = 'auto' | 'gpu' | 'swiftshader'

export function adapterChoice(spec: EnvironmentSpec | undefined): AdapterChoice {
  const value = spec?.adapter
  return value === 'gpu' || value === 'swiftshader' ? value : 'auto'
}
