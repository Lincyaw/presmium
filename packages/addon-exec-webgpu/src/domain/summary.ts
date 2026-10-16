/**
 * What a run of a shader shows (P-104): each buffer read back, its values
 * (the first and last few of a long one, with the minimum, maximum and mean),
 * the median time of a dispatch, marked as CPU emulation on a fallback
 * adapter, and the adapter; or why it could not run. The environment
 * fingerprint of compile-time recordings names the browser and the adapter.
 */
import type { AdapterDescription, BufferSummary, ComputeOutcome } from './compute.ts'
import type { WebgpuMessages } from './messages.ts'

/** A value as the summary shows it: integers whole, others to 6 significant digits. */
export function formatNumber(value: number): string {
  if (Number.isInteger(value) && Math.abs(value) < 1e15) return String(value)
  return Number.isFinite(value) ? String(Number(value.toPrecision(6))) : String(value)
}

/** `out: f32[4] = [11, 22, 33, 44]`; a long buffer `[0, 1, 2, 3, …, 1020, 1021, 1022, 1023]` with its statistics. */
export function bufferLine(buffer: BufferSummary, text: WebgpuMessages): string {
  const values = buffer.tail.length
    ? [...buffer.head.map(formatNumber), '…', ...buffer.tail.map(formatNumber)]
    : buffer.head.map(formatNumber)
  const line = `${buffer.name}: ${buffer.type}[${buffer.length}] = [${values.join(', ')}]`
  return buffer.tail.length ? `${line}  ${text.stats(formatNumber(buffer.min), formatNumber(buffer.max), formatNumber(buffer.mean))}` : line
}

/** The adapter's name: vendor and architecture (or its description). */
export function adapterName(adapter: AdapterDescription): string {
  return [adapter.vendor, adapter.architecture].filter(Boolean).join(' ') || adapter.description || 'unknown'
}

/** The text of a successful run: one line per buffer read back, then the timing and the adapter. */
export function summary(outcome: Extract<ComputeOutcome, { ok: true }>, text: WebgpuMessages): string {
  const { timing, adapter } = outcome
  const ms = formatNumber(Number(timing.ms.toPrecision(3)))
  return [
    ...outcome.buffers.map(b => bufferLine(b, text)),
    text.time(ms, timing.samples, timing.source === 'gpu', adapter.fallback),
    text.adapter(adapterName(adapter), adapter.fallback),
  ].join('\n') + '\n'
}

/** Why a run did not happen or failed, in the language of `text`. */
export function failure(outcome: Extract<ComputeOutcome, { ok: false }>, text: WebgpuMessages): string {
  switch (outcome.reason) {
    case 'no-webgpu': return text.noWebgpu
    case 'no-adapter': return text.noAdapter
    case 'feature': return text.missingFeature(outcome.detail)
    case 'limit': return text.missingLimit(outcome.detail)
    case 'device-lost': return text.deviceLost(outcome.detail)
    case 'shader': return text.shader(outcome.detail)
    case 'validation': return text.validation(outcome.detail)
  }
}

/**
 * The environment fingerprint of recordings (docs/ir.md section 4): the
 * browser's version and the adapter, `fallback` for a CPU emulation, e.g.
 * `chromium 156.0.8078.4; google swiftshader (fallback)`.
 */
export function fingerprint(browser: string, adapter: AdapterDescription): string {
  return `${browser}; ${adapterName(adapter)}${adapter.fallback ? ' (fallback)' : ''}`
}
