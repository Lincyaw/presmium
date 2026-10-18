import type { WasiOutput, WasiRequest } from '../runner.mjs'

export interface WorkerRequest {
  id: number
  request: WasiRequest
  runtimeURL: string
}

export type WorkerReply =
  | { id: number, type: 'started' }
  | { id: number, type: 'done', output: WasiOutput }
  | { id: number, type: 'error', stage: 'load' | 'run', error: string }
