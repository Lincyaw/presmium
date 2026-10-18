import type { AdapterDescription, ComputeBuffer, ComputeOutcome, ComputeRequest } from './domain/compute.ts'

export function describeAdapter(adapter: unknown): AdapterDescription
export function probeAdapter(gpu: unknown): Promise<AdapterDescription | undefined>
export function bufferBytes(buffer: Pick<ComputeBuffer, 'length' | 'usage'>): number
export function compute(gpu: unknown, request: ComputeRequest, hooks?: { device?(device: { destroy(): void }): void }): Promise<ComputeOutcome>
