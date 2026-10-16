/**
 * What the compute core (src/gpu.mjs) takes and gives: a shader with its
 * buffers, dispatch and repetitions, and the buffers read back with the
 * timing and the adapter, or why it could not run.
 */

export type ScalarType = 'f32' | 'i32' | 'u32'

/** A buffer of the shader, as ./params.ts reads it from the shader and `:params:`. */
export interface ComputeBuffer {
  /** The shader's variable. */
  name: string
  group: number
  binding: number
  usage: 'storage' | 'uniform'
  /** Storage access: `read` buffers are bound as `read-only-storage`. */
  access: 'read' | 'read_write'
  type: ScalarType
  /** Number of values. */
  length: number
  data?: number[]
  fill?: number
  /** Read back and shown after the run. */
  read: boolean
}

export interface ComputeRequest {
  code: string
  /** The entry point; omitted, the shader's only compute entry point. */
  entry?: string
  buffers: ComputeBuffer[]
  dispatch: [number, number, number]
  repeat: number
  features: string[]
}

export interface AdapterDescription {
  vendor: string
  architecture: string
  description: string
  /** A fallback adapter (e.g. SwiftShader): the GPU is emulated on the CPU. */
  fallback: boolean
}

export interface BufferSummary {
  name: string
  type: ScalarType
  length: number
  /** The values of a short buffer, else its first few. */
  head: number[]
  /** The last few values of a long buffer; empty for a short one. */
  tail: number[]
  min: number
  max: number
  mean: number
}

export interface Timing {
  /** Median time of one dispatch, in ms. */
  ms: number
  samples: number
  /** `gpu`: the GPU's timestamps (`timestamp-query`); `wall`: from submitting until the queue is done. */
  source: 'gpu' | 'wall'
}

/** Why a shader cannot run here, so its recorded output stands in. */
export type Unavailable = 'no-webgpu' | 'no-adapter' | 'feature' | 'limit' | 'device-lost'

export type ComputeOutcome =
  | { ok: true, buffers: BufferSummary[], timing: Timing, adapter: AdapterDescription }
  /** `shader`, `validation`: WebGPU rejected the shader or its use, the program's own error. */
  | { ok: false, reason: Unavailable | 'shader' | 'validation', detail: string, adapter?: AdapterDescription }

export function unavailable(reason: string): reason is Unavailable {
  return ['no-webgpu', 'no-adapter', 'feature', 'limit', 'device-lost'].includes(reason)
}
