import { isRecord } from '@lincyaw/kernel'

export const EXEC_WASI_ID = 'presmium.execWasi'

export const WASI_EXECUTOR_ID = 'presmium.wasi'

export const WASI_KIND = 'wasi'

export const RUNTIME_DIR = 'wasi/'

export const DEFAULT_TIMEOUT_MS = 10_000

export const MEMORY_LIMIT_MB = 1024

export interface ExecWasiConfig {
  loadTimeoutMs: number
  runtimes: string[]
}

export const DEFAULT_EXEC_WASI_CONFIG: ExecWasiConfig = { loadTimeoutMs: 120_000, runtimes: [] }

export function execWasiConfig(raw: unknown): ExecWasiConfig {
  const config = isRecord(raw) ? raw : {}
  const load = config.loadTimeoutMs
  return {
    loadTimeoutMs: typeof load === 'number' && load > 0 ? load : DEFAULT_EXEC_WASI_CONFIG.loadTimeoutMs,
    runtimes: Array.isArray(config.runtimes) ? config.runtimes.filter((r): r is string => typeof r === 'string') : [],
  }
}
