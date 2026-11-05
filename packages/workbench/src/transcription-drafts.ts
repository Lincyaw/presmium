import { isRecord, randomUUID } from '@lincyaw/kernel'
import type { NarrationNode, TranscriptionAdoptionDraft } from '@lincyaw/kernel'

export interface TranscriptionCorrection { id: string, revision: number, nodes?: NarrationNode[], discarded: string[], shared: 'fork' | 'edit-shared', baseVersion?: string, applied?: boolean }
export interface TranscriptionCorrectionTarget { identity: string, candidate: TranscriptionAdoptionDraft['candidate'], stepId: string, narrationId?: string, segmentIds: string[] }
interface Entry { target: TranscriptionCorrectionTarget, draft?: TranscriptionCorrection, raw?: string | null, failed: boolean, corrupt: boolean }
const prefix = 'presmium.transcription-draft.v1:'
export const transcriptionCorrectionKey = (target: TranscriptionCorrectionTarget): string => JSON.stringify([target.identity, target.candidate.id, target.candidate.revision, target.stepId, target.narrationId ?? null, target.segmentIds])
const fresh = (): TranscriptionCorrection => ({ id: randomUUID(), revision: 0, discarded: [], shared: 'fork' })
function valid(value: unknown): value is TranscriptionCorrection {
  return isRecord(value) && typeof value.id === 'string' && Number.isSafeInteger(value.revision) && Number(value.revision) >= 0 && Array.isArray(value.discarded) && value.discarded.every(key => typeof key === 'string') && ['fork', 'edit-shared'].includes(String(value.shared))
    && (value.baseVersion === undefined || typeof value.baseVersion === 'string') && (value.applied === undefined || typeof value.applied === 'boolean')
    && (value.nodes === undefined || Array.isArray(value.nodes) && value.nodes.every(node => isRecord(node) && (node.type === 'text' && typeof node.text === 'string' || node.type === 'pronunciation' && typeof node.display === 'string' && typeof node.spoken === 'string' || node.type === 'cue' && typeof node.id === 'string' && typeof node.action === 'string')))
}
function parseTarget(key: string): TranscriptionCorrectionTarget | undefined {
  try {
    const value: unknown = JSON.parse(key)
    if (!Array.isArray(value) || value.length !== 6) return
    const [identity, id, revision, stepId, narrationId, segmentIds] = value
    if (typeof identity !== 'string' || typeof id !== 'string' || typeof revision !== 'string' || typeof stepId !== 'string' || narrationId !== null && typeof narrationId !== 'string' || !Array.isArray(segmentIds) || !segmentIds.every(id => typeof id === 'string')) return
    return { identity, candidate: { id, revision }, stepId, ...narrationId !== null ? { narrationId } : {}, segmentIds }
  } catch { return }
}

/** The native correction bank uses its existing localStorage keys; no MCP copy or provider result is changed. */
export class TranscriptionCorrections {
  readonly #entries = new Map<string, Entry>()
  #load(target: TranscriptionCorrectionTarget): Entry {
    const key = transcriptionCorrectionKey(target), known = this.#entries.get(key)
    if (known) return known
    const entry: Entry = { target: structuredClone(target), failed: false, corrupt: false }
    this.#entries.set(key, entry)
    try {
      entry.raw = localStorage.getItem(prefix + key)
      if (entry.raw !== null) {
        const value: unknown = JSON.parse(entry.raw)
        if (!valid(value)) throw new Error('invalid-draft')
        entry.draft = value
      }
    } catch { entry.failed = true; entry.corrupt = entry.raw != null }
    return entry
  }
  read(target: TranscriptionCorrectionTarget): { draft: TranscriptionCorrection, failed: boolean } {
    const entry = this.#load(target)
    // A reopened native form adopts another window's saved value, retaining failed local input.
    try {
      const raw = localStorage.getItem(prefix + transcriptionCorrectionKey(target))
      if (raw !== entry.raw && !(entry.failed && entry.draft)) {
        const value: unknown = raw === null ? undefined : JSON.parse(raw)
        if (value !== undefined && !valid(value)) throw new Error('invalid-draft')
        entry.raw = raw; entry.draft = value as TranscriptionCorrection | undefined; entry.failed = false; entry.corrupt = false
      } else if (raw !== entry.raw) entry.failed = true
    } catch { entry.failed = true }
    return { draft: entry.draft ? structuredClone(entry.draft) : fresh(), failed: entry.failed }
  }
  keep(target: TranscriptionCorrectionTarget, draft: TranscriptionCorrection): boolean {
    if (!valid(draft)) throw new Error('invalid-draft')
    const entry = this.#load(target), key = prefix + transcriptionCorrectionKey(target)
    entry.draft = structuredClone(draft)
    try {
      if (entry.raw === undefined || localStorage.getItem(key) !== entry.raw) throw new Error('changed-draft')
      if (entry.corrupt && entry.raw != null) localStorage.setItem(key + ':unreadable', entry.raw)
      const raw = JSON.stringify(draft)
      localStorage.setItem(key, raw)
      entry.raw = raw; entry.failed = false; entry.corrupt = false
      return true
    } catch { entry.failed = true; return false }
  }
  /** A completed native adoption cannot retire input changed in another form/window while it ran. */
  complete(target: TranscriptionCorrectionTarget, expected: TranscriptionCorrection, next: TranscriptionCorrection): boolean {
    const key = transcriptionCorrectionKey(target), entry = this.#entries.get(key)
    if (!entry || entry.corrupt || JSON.stringify(entry.draft) !== JSON.stringify(expected)) return false
    try {
      if (entry.raw === undefined || localStorage.getItem(prefix + key) !== entry.raw) return false
      const raw = JSON.stringify(next)
      localStorage.setItem(prefix + key, raw)
      entry.raw = raw; entry.draft = structuredClone(next); entry.failed = false
      return true
    } catch { entry.failed = true; return false }
  }
  discard(key: string, expected: TranscriptionCorrection): boolean {
    const entry = this.#entries.get(key)
    if (!entry || entry.corrupt || JSON.stringify(entry.draft) !== JSON.stringify(expected)) return false
    try {
      if (entry.raw === undefined || localStorage.getItem(prefix + key) !== entry.raw) return false
      localStorage.removeItem(prefix + key)
      this.#entries.delete(key)
      return true
    } catch { entry.failed = true; return false }
  }
  snapshot(identity: string) {
    const keys = new Set([...this.#entries].filter(([, entry]) => entry.target.identity === identity).map(([key]) => key))
    let partial = false
    const head = prefix + JSON.stringify([identity]).slice(0, -1) + ','
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key?.startsWith(head) && !key.endsWith(':unreadable')) keys.add(key.slice(prefix.length))
      }
    } catch { partial = true }
    const entries: { key: string, target: TranscriptionCorrectionTarget, draft: TranscriptionCorrection, persisted: boolean }[] = [], observed: [string, string | null][] = []
    for (const key of keys) {
      const target = parseTarget(key)
      if (!target || target.identity !== identity) { partial = true; continue }
      const entry = this.#load(target)
      let persisted = false
      try {
        const raw = localStorage.getItem(prefix + key)
        observed.push([key, raw])
        persisted = !entry.failed && !entry.corrupt && raw === entry.raw
        if (raw !== entry.raw) partial = true
      } catch { partial = true }
      if (entry.corrupt || entry.raw === undefined) partial = true
      if (entry.draft && !entry.draft.applied) entries.push({ key, target: structuredClone(target), draft: structuredClone(entry.draft), persisted })
    }
    return { entries, partial, guard: () => {
      for (const [key, raw] of observed) {
        try { if (localStorage.getItem(prefix + key) === raw) continue } catch { /* Cannot verify the same persisted input. */ }
        throw new Error('client-production-drafts-changed')
      }
    } }
  }
  close(): void { this.#entries.clear() }
}
