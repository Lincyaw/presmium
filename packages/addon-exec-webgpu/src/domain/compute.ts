export type ScalarType = 'f32' | 'i32' | 'u32'

export interface ComputeBuffer {
  name: string
  group: number
  binding: number
  usage: 'storage' | 'uniform'
  access: 'read' | 'read_write'
  type: ScalarType
  length: number
  data?: number[]
  fill?: number
  read: boolean
}

export interface ComputeRequest {
  code: string
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
  fallback: boolean
}

export interface BufferSummary {
  name: string
  type: ScalarType
  length: number
  head: number[]
  tail: number[]
  min: number
  max: number
  mean: number
}

export interface Timing {
  ms: number
  samples: number
  source: 'gpu' | 'wall'
}

export type Unavailable = 'no-webgpu' | 'no-adapter' | 'feature' | 'limit' | 'device-lost'

export type ComputeOutcome =
  | { ok: true, buffers: BufferSummary[], timing: Timing, adapter: AdapterDescription }
  | { ok: false, reason: Unavailable | 'shader' | 'validation', detail: string, adapter?: AdapterDescription }

export function unavailable(reason: string): reason is Unavailable {
  return ['no-webgpu', 'no-adapter', 'feature', 'limit', 'device-lost'].includes(reason)
}
