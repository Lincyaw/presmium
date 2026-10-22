import type { AdapterDescription, ComputeOutcome, ComputeRequest } from '../domain/compute.ts'

export function probeAdapter(gpu: unknown): Promise<AdapterDescription | undefined>
export function compute(gpu: unknown, request: ComputeRequest, hooks?: { device?(device: { destroy(): void }): void }): Promise<ComputeOutcome>
