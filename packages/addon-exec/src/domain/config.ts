/** Id under which this addon reads its options from the `presmium` config. */
export const EXEC_ID = 'presmium.exec'

export interface ExecConfig {
  /** Default run timeout in milliseconds, counted from the start of execution (runtime loading excluded). */
  timeoutMs: number
  /** Most trace events recorded before a stepwise run is stopped. */
  maxTraceEvents: number
  /** Where the Pyodide runtime files are served; defaults to `<base>pyodide/` of the deck. */
  pyodideURL?: string
}

export const DEFAULT_EXEC_CONFIG: ExecConfig = { timeoutMs: 10_000, maxTraceEvents: 500 }

const positive = (value: unknown, fallback: number) => (typeof value === 'number' && value > 0 ? value : fallback)

/** Reads `presmium: { presmium.exec: { timeoutMs, maxTraceEvents, pyodideURL } }`, ignoring malformed values. */
export function execConfig(raw: Record<string, unknown>): ExecConfig {
  return {
    timeoutMs: positive(raw.timeoutMs, DEFAULT_EXEC_CONFIG.timeoutMs),
    maxTraceEvents: positive(raw.maxTraceEvents, DEFAULT_EXEC_CONFIG.maxTraceEvents),
    pyodideURL: typeof raw.pyodideURL === 'string' && raw.pyodideURL ? raw.pyodideURL : undefined,
  }
}

/** Languages the Python executors accept. */
export function isPython(lang: string): boolean {
  return ['python', 'py', 'python3'].includes(lang.toLowerCase())
}
