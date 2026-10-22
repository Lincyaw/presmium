import { isRecord } from '@lincyaw/kernel'

export const EXEC_LOCAL_ID = 'presmium.execLocal'

export const DEVCONTAINER_KIND = 'devcontainer'

export interface ExecLocalConfig {
  workspace?: string
  priority: number
  buildTimeoutMs: number
}

export const DEFAULT_PRIORITY = 10

export const DEFAULT_BUILD_TIMEOUT_MS = 600_000

export function execLocalConfig(options: unknown): ExecLocalConfig {
  const config = isRecord(options) ? options : {}
  const buildTimeoutMs = config.buildTimeoutMs
  return {
    workspace: typeof config.workspace === 'string' ? config.workspace : undefined,
    priority: typeof config.priority === 'number' ? config.priority : DEFAULT_PRIORITY,
    buildTimeoutMs: typeof buildTimeoutMs === 'number' && buildTimeoutMs > 0 ? buildTimeoutMs : DEFAULT_BUILD_TIMEOUT_MS,
  }
}
