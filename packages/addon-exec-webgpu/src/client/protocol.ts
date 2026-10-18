import type { ComputeOutcome, ComputeRequest } from '../domain/index.ts'

export type WorkerRequest =
  | { type: 'run', request: ComputeRequest }
  | { type: 'stop' }

export type WorkerReply =
  | { type: 'done', outcome: ComputeOutcome }
  | { type: 'stopped' }
