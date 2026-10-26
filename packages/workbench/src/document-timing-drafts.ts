import type { TeachingDocument } from '@lincyaw/kernel'
import { stepTimingValue } from './step-production.ts'
import type { ProductionSource, StepDurationDraft, StepDurationKey } from './step-production.ts'

interface StoredDraft extends StepDurationDraft { baseValue?: number, baseSource: ProductionSource }
const KEYS = ['minimumHoldMs', 'trailingPauseMs'] as const

/** Only unaccepted form strings live here. Accepted timing remains in the document actor. */
export class DocumentTimingDrafts {
  readonly #documents = new Map<string, Map<string, StoredDraft>>()
  failed = false
  #storage(identity: string): string { return `presmium.document-timing.v1:${identity}` }
  #load(identity: string): Map<string, StoredDraft> {
    const existing = this.#documents.get(identity)
    if (existing) return existing
    const values = new Map<string, StoredDraft>()
    this.#documents.set(identity, values)
    let raw: string | null = null
    try {
      raw = sessionStorage.getItem(this.#storage(identity))
      const entries: unknown = JSON.parse(raw ?? '[]')
      if (!Array.isArray(entries) || entries.length > 512) throw new Error('document-timing-draft-data')
      for (const entry of entries) {
        if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string' || !entry[1] || typeof entry[1] !== 'object') throw new Error('document-timing-draft-data')
        const target: unknown = JSON.parse(entry[0]), value = entry[1] as StoredDraft
        if (!Array.isArray(target) || typeof target[0] !== 'string' || !KEYS.includes(target[1]) || typeof value.text !== 'string' || value.text.length > 256 || !['step', 'section', 'document', 'unset'].includes(value.baseSource) || value.baseValue !== undefined && (typeof value.baseValue !== 'number' || !Number.isFinite(value.baseValue) || value.baseValue < 0)) throw new Error('document-timing-draft-data')
        values.set(entry[0], { text: value.text, error: true, review: true, baseValue: value.baseValue, baseSource: value.baseSource })
      }
    } catch {
      this.failed = true
      if (raw !== null) try { sessionStorage.setItem(`${this.#storage(identity)}:unreadable`, raw) } catch { /* Keep the original slot untouched when storage is unavailable. */ }
    }
    if (!this.failed) for (const key of this.#documents.keys()) {
      if (this.#documents.size <= 8) break
      if (key !== identity) this.#documents.delete(key)
    }
    return values
  }
  get(identity: string, document: TeachingDocument, stepId: string, key: StepDurationKey): StepDurationDraft | undefined {
    const draft = this.#load(identity).get(JSON.stringify([stepId, key]))
    if (!draft) return undefined
    const actual = stepTimingValue(document, stepId, key)
    return { text: draft.text, error: draft.error, review: draft.review || draft.baseValue !== actual.value || draft.baseSource !== actual.source }
  }
  has(identity: string, document: TeachingDocument): boolean {
    return [...this.#load(identity).keys()].some(target => Object.hasOwn(document.steps, JSON.parse(target)[0]))
  }
  set(identity: string, document: TeachingDocument, stepId: string, key: StepDurationKey, draft: StepDurationDraft | undefined): boolean {
    const values = this.#load(identity), target = JSON.stringify([stepId, key]), previous = values.get(target), actual = stepTimingValue(document, stepId, key)
    if (draft && draft.text.length > 256 || draft && !previous && values.size >= 512) { this.failed = true; return true }
    if (previous?.text === draft?.text && previous?.error === draft?.error && !previous?.review && (!previous || previous.baseValue === actual.value && previous.baseSource === actual.source)) return false
    if (draft) values.set(target, { ...draft, baseValue: actual.value, baseSource: actual.source })
    else values.delete(target)
    try {
      if (values.size) sessionStorage.setItem(this.#storage(identity), JSON.stringify([...values]))
      else sessionStorage.removeItem(this.#storage(identity))
      this.failed = false
    } catch { this.failed = true }
    return true
  }
}
