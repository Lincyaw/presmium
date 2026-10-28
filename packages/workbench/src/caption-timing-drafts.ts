import type { CaptionTimingSource, TeachingDocument } from '@lincyaw/kernel'

export interface CaptionTimingRow { id: string, from: number, to: number, start: string, end: string }
export interface CaptionTimingDraft { version: string, text: string, basis: CaptionTimingSource, rows: CaptionTimingRow[] }
type Scope = { identity: string, memberId: string }
interface Entry { values: Map<string, CaptionTimingDraft>, failed: boolean, unreadable: boolean }
const MAX_CHARS = 1 << 20
const MAX_TARGETS = 512
const valid = (value: unknown): value is CaptionTimingDraft => {
  if (!value || typeof value !== 'object') return false
  const d = value as CaptionTimingDraft, b = d.basis
  if (typeof d.version !== 'string' || !d.version || d.version.length > 256 || typeof d.text !== 'string' || d.text.length > MAX_CHARS
    || !b || typeof b !== 'object' || typeof b.available !== 'boolean' || typeof b.sourceFingerprint !== 'string'
    || b.sourceFingerprint.length > 256 || b.playbackFingerprint !== undefined && (typeof b.playbackFingerprint !== 'string' || b.playbackFingerprint.length > 256)
    || b.durationMs !== undefined && (!Number.isSafeInteger(b.durationMs) || b.durationMs < 0)
    || b.reason !== undefined && (typeof b.reason !== 'string' || b.reason.length > 256)
    || !Array.isArray(b.narrationIds) || b.narrationIds.length > MAX_TARGETS || b.narrationIds.some(id => typeof id !== 'string' || id.length > 256)
    || !Array.isArray(d.rows) || d.rows.length > MAX_TARGETS) return false
  return d.rows.every(r => r && typeof r.id === 'string' && r.id.length <= 256 && Number.isSafeInteger(r.from) && r.from >= 0
    && Number.isSafeInteger(r.to) && r.to >= r.from && r.to <= d.text.length && typeof r.start === 'string' && r.start.length <= 32 && typeof r.end === 'string' && r.end.length <= 32)
}

/** Unapplied author inputs are per-tab recovery data, never the canonical production timing. */
export class CaptionTimingDrafts {
  readonly #entries = new Map<string, Entry>()
  readonly #leave = (event: BeforeUnloadEvent) => { if ([...this.#entries.values()].some(entry => entry.values.size || entry.failed)) event.preventDefault() }
  constructor() { if (typeof window !== 'undefined') window.addEventListener('beforeunload', this.#leave) }
  #key(scope: Scope): string { return `presmium.caption-timing.v1:${JSON.stringify([scope.identity, scope.memberId])}` }
  #entry(scope: Scope): Entry {
    const key = this.#key(scope), existing = this.#entries.get(key)
    if (existing) return existing
    const result: Entry = { values: new Map(), failed: false, unreadable: false }; this.#entries.set(key, result)
    try {
      const raw = sessionStorage.getItem(key)
      if (raw === null) return result
      if (raw.length > MAX_CHARS) throw new Error('caption-draft-limit')
      const data: unknown = JSON.parse(raw)
      if (!Array.isArray(data) || data.length > MAX_TARGETS) throw new Error('caption-draft-data')
      for (const pair of data) {
        if (!Array.isArray(pair) || pair.length !== 2 || typeof pair[0] !== 'string' || !pair[0] || pair[0].length > 256 || !valid(pair[1]) || result.values.has(pair[0])) throw new Error('caption-draft-data')
        result.values.set(pair[0], pair[1])
      }
    } catch { result.values.clear(); result.failed = true; result.unreadable = true }
    return result
  }
  get(scope: Scope, stepId: string): CaptionTimingDraft | undefined { return this.#entry(scope).values.get(stepId) }
  steps(scope: Scope, document: TeachingDocument): string[] { return [...this.#entry(scope).values.keys()].filter(id => Object.hasOwn(document.steps, id)) }
  failed(scope: Scope): boolean { return this.#entry(scope).failed }
  set(scope: Scope, stepId: string, value: CaptionTimingDraft | undefined): void {
    const entry = this.#entry(scope)
    if (value) entry.values.set(stepId, value); else entry.values.delete(stepId)
    if (entry.unreadable) { entry.failed = true; return }
    try {
      const key = this.#key(scope), raw = JSON.stringify([...entry.values])
      if (raw.length > MAX_CHARS || entry.values.size > MAX_TARGETS || [...entry.values.values()].some(draft => !valid(draft))) throw new Error('caption-draft-limit')
      if (entry.values.size) sessionStorage.setItem(key, raw); else sessionStorage.removeItem(key)
      entry.failed = false
    } catch { entry.failed = true }
  }
  close(): void { if (typeof window !== 'undefined') window.removeEventListener('beforeunload', this.#leave) }
}
