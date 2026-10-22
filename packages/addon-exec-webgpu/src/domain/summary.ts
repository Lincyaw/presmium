import type { AdapterDescription, BufferSummary, ComputeOutcome } from './compute.ts'
import type { WebgpuMessages } from './messages.ts'

export function formatNumber(value: number): string {
  if (Number.isInteger(value) && Math.abs(value) < 1e15) return String(value)
  return Number.isFinite(value) ? String(Number(value.toPrecision(6))) : String(value)
}

export function bufferLine(buffer: BufferSummary, text: WebgpuMessages): string {
  const values = buffer.tail.length
    ? [...buffer.head.map(formatNumber), '…', ...buffer.tail.map(formatNumber)]
    : buffer.head.map(formatNumber)
  const line = `${buffer.name}: ${buffer.type}[${buffer.length}] = [${values.join(', ')}]`
  return buffer.tail.length ? `${line}  ${text.stats(formatNumber(buffer.min), formatNumber(buffer.max), formatNumber(buffer.mean))}` : line
}

export function adapterName(adapter: AdapterDescription): string {
  return [adapter.vendor, adapter.architecture].filter(Boolean).join(' ') || adapter.description || 'unknown'
}

export function summaryText(outcome: Extract<ComputeOutcome, { ok: true }>, text: WebgpuMessages): string {
  const { timing, adapter } = outcome
  const ms = formatNumber(Number(timing.ms.toPrecision(3)))
  return [
    ...outcome.buffers.map(b => bufferLine(b, text)),
    text.time(ms, timing.samples, timing.source === 'gpu', adapter.fallback),
    text.adapter(adapterName(adapter), adapter.fallback),
  ].join('\n') + '\n'
}

export function failureText(outcome: Extract<ComputeOutcome, { ok: false }>, text: WebgpuMessages): string {
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

/** The environment's fingerprint: the browser and the adapter, marked when it is a fallback adapter. */
export function adapterFingerprint(browser: string, adapter: AdapterDescription): string {
  return `${browser}; ${adapterName(adapter)}${adapter.fallback ? ' (fallback)' : ''}`
}
