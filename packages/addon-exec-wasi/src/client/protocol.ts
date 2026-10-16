import type { WasiOutput, WasiRequest } from '../runner.mjs'

/** A request to the WASI worker: run `request`, loading the runtime files from `runtimeURL` (absolute, ending with `/`). */
export interface WorkerRequest {
  id: number
  request: WasiRequest
  runtimeURL: string
}

/**
 * The worker's replies to a request: `started` once the runtime has loaded
 * (the run's timeout starts then), then `done` with the output, or `error`
 * when the runtime could not load (`load`) or failed (`run`).
 */
export type WorkerReply =
  | { id: number, type: 'started' }
  | { id: number, type: 'done', output: WasiOutput }
  | { id: number, type: 'error', stage: 'load' | 'run', error: string }
