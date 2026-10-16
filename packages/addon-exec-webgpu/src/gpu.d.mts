/** The types of gpu.mjs, the compute core shared by the worker and the recording page (defined in src/domain/compute.ts). */
import type { AdapterDescription, ComputeBuffer, ComputeOutcome, ComputeRequest } from './domain/compute.ts'

export function describeAdapter(adapter: unknown): AdapterDescription
export function probeAdapter(gpu: unknown): Promise<AdapterDescription | undefined>
export function bufferBytes(buffer: Pick<ComputeBuffer, 'length' | 'usage'>): number
/** `gpu` is `navigator.gpu`, or undefined where there is none. */
export function compute(gpu: unknown, request: ComputeRequest, hooks?: { device?(device: { destroy(): void }): void }): Promise<ComputeOutcome>
