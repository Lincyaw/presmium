import type { ComputeOutcome, ComputeRequest } from '../domain/index.ts'

/** Messages between the executor and its worker. */
export type WorkerRequest =
  | { type: 'run', request: ComputeRequest }
  /** Destroy the device: the run timed out or was cancelled. */
  | { type: 'stop' }

export type WorkerReply =
  | { type: 'done', outcome: ComputeOutcome }
  | { type: 'stopped' }
