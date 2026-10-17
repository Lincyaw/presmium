import { isRecord } from '@presmium/kernel'

/** Id under which this addon reads its options from the `presmium` config. */
export const EXEC_WASI_ID = 'presmium.execWasi'

/** The executor of the WASI languages, in the browser and at compile time; a `kind: wasi` environment's is `presmium.env.<name>`. */
export const WASI_EXECUTOR_ID = 'presmium.wasi'

/** The provider kind of WASI environments (`execute.environments.<name>.kind`). */
export const WASI_KIND = 'wasi'

/** Directory under the form's base URL where the runtime files are published. */
export const RUNTIME_DIR = 'wasi/'

/**
 * Run timeout of a request without one (`:timeout:`, or `presmium.exec.timeoutMs`
 * through the execution plugin's pass), in milliseconds: compiling C or C++
 * included, counted once the runtime has loaded.
 */
export const DEFAULT_TIMEOUT_MS = 10_000

/**
 * The memory of a compile-time run's program, in MiB (a WebAssembly memory
 * of at most this many 64 KiB pages times 16): past it the program's
 * allocations fail, so a program that allocates without end does not take
 * the build machine with it (N-08).
 */
export const MEMORY_LIMIT_MB = 1024

export interface ExecWasiConfig {
  /** How long a browser run waits for its runtime to download and compile before it fails (and shows its recorded output). */
  loadTimeoutMs: number
  /**
   * The runtimes the deck's live code needs (`clang`, `ruby`, `sqlite`), which
   * the forms publish. Written by the plugin's pass, not by the author; a
   * build without it publishes none (the dev servers serve all of them).
   */
  runtimes: string[]
}

export const DEFAULT_EXEC_WASI_CONFIG: ExecWasiConfig = { loadTimeoutMs: 120_000, runtimes: [] }

/** Reads `presmium: { presmium.execWasi: { loadTimeoutMs, runtimes } }`, ignoring malformed values. */
export function execWasiConfig(raw: unknown): ExecWasiConfig {
  const config = isRecord(raw) ? raw : {}
  const load = config.loadTimeoutMs
  return {
    loadTimeoutMs: typeof load === 'number' && load > 0 ? load : DEFAULT_EXEC_WASI_CONFIG.loadTimeoutMs,
    runtimes: Array.isArray(config.runtimes) ? config.runtimes.filter((r): r is string => typeof r === 'string') : [],
  }
}
