import type { RunOutput as RichOutput, RunRequest } from '@lincyaw/kernel'

export interface WorkerRequest {
  id: number
  kind: 'run' | 'trace' | 'end'
  request: RunRequest
  indexURL: string
  maxEvents: number
}

export type WorkerReply =
  | { id: number; type: 'started' }
  | { id: number; type: 'done'; value: RunOutput | TraceOutput | null; durationMs: number }
  | { id: number; type: 'failed'; error: string }

export interface RunOutput {
  stdout: string
  stderr: string
  exitCode: number
  outputs?: RichOutput[]
}

export interface TraceOutput {
  events: { line: number; output: string }[]
  truncated: boolean
  output: string
}
