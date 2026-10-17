import { isRecord } from '@presmium/kernel'

/** Id under which this addon reads its options from `presmium` config. */
export const EXEC_LOCAL_ID = 'presmium.execLocal'

export interface ExecLocalConfig {
  /**
   * Folder that holds the devcontainer definition and the snippets' files,
   * relative to the deck directory. Defaults to the workspace root.
   */
  workspace?: string
  /** Executor router priority of the container executor; higher wins over the browser executor. */
  priority: number
  /** How long building the devcontainer image may take before it is stopped (ms). */
  buildTimeoutMs: number
}

export const DEFAULT_PRIORITY = 10

/** Ten minutes: a first build pulls the base image and installs the features. */
export const DEFAULT_BUILD_TIMEOUT_MS = 600_000

/** Reads `presmium: { presmium.execLocal: {...} }` options; `options` is that inner object. */
export function execLocalConfig(options: unknown): ExecLocalConfig {
  const config = isRecord(options) ? options : {}
  const buildTimeoutMs = config.buildTimeoutMs
  return {
    workspace: typeof config.workspace === 'string' ? config.workspace : undefined,
    priority: typeof config.priority === 'number' ? config.priority : DEFAULT_PRIORITY,
    buildTimeoutMs: typeof buildTimeoutMs === 'number' && buildTimeoutMs > 0 ? buildTimeoutMs : DEFAULT_BUILD_TIMEOUT_MS,
  }
}
