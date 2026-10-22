import type { RunOutput, RunRequest } from '@lincyaw/kernel'

export interface WorkerRequest {
  id: number
  kind: 'run' | 'trace' | 'end'
  request: RunRequest
  indexURL: string
  maxEvents: number
}

export type WorkerReply =
  | { id: number; type: 'started' }
  | { id: number; type: 'done'; value: WorkerRunResult | WorkerTraceResult | null; durationMs: number }
  | { id: number; type: 'failed'; error: string }

export interface WorkerRunResult {
  stdout: string
  stderr: string
  exitCode: number
  outputs?: RunOutput[]
}

export interface WorkerTraceResult {
  events: { line: number; output: string }[]
  truncated: boolean
  output: string
}
