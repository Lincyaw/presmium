import { languageId } from '@presmium/kernel'
import type { EnvironmentSpec } from '@presmium/kernel'

/** Id of the plugin, under which it reads its options from the `presmium` config. */
export const EXEC_WEBGPU_ID = 'presmium.execWebgpu'

/** The executor of `wgsl` code, in the browser and at compile time; a `kind: webgpu` environment's is `presmium.env.<name>`. */
export const WEBGPU_EXECUTOR_ID = 'presmium.webgpu'

/** Timeout of a run whose request sets none, counted from the start of the run (the worker, or the recording page). */
export const DEFAULT_TIMEOUT_MS = 10_000

/** The scale limits of a run: all buffers together, and the dispatches of one run. */
export const LIMITS = { maxBytes: 128 * 1024 * 1024, maxRepeat: 1000 }

/** The language of compute shaders (`{run-panel} wgsl`). */
export function isWgsl(lang: string): boolean {
  return languageId(lang) === 'wgsl'
}

/**
 * Which adapter compile time records with (the `adapter` option of a
 * `kind: webgpu` environment): `auto` (the default) uses the GPU through
 * Vulkan when Chromium finds one, else SwiftShader; `gpu` only the GPU;
 * `swiftshader` the CPU emulation, the same on every machine.
 */
export type AdapterChoice = 'auto' | 'gpu' | 'swiftshader'

export function adapterChoice(spec: EnvironmentSpec | undefined): AdapterChoice {
  const value = spec?.adapter
  return value === 'gpu' || value === 'swiftshader' ? value : 'auto'
}
