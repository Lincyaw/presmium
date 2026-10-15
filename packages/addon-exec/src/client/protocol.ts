import type { RunRequest } from '@presmium/kernel'

/** Messages between the main thread and the Pyodide worker. */
export interface WorkerRequest {
  id: number
  kind: 'run' | 'trace'
  request: RunRequest
  /** Base URL of the Pyodide runtime files, ending with `/`. */
  indexURL: string
  maxEvents: number
}

export type WorkerReply =
  /** The runtime is loaded and the code starts running; timeouts count from here. */
  | { id: number; type: 'started' }
  | { id: number; type: 'done'; value: RunOutput | TraceOutput; durationMs: number }
  | { id: number; type: 'failed'; error: string }

/** JSON returned by `_pm_run` in runner.py. */
export interface RunOutput {
  stdout: string
  stderr: string
  exitCode: number
}

/** JSON returned by `_pm_trace` in runner.py. */
export interface TraceOutput {
  events: { line: number; output: string }[]
  truncated: boolean
  output: string
}
