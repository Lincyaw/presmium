import { isRecord } from '@lincyaw/kernel'
import type { CanonicalSource, JsonObject } from '@lincyaw/kernel'
import { DocumentDraftStore } from './document-draft-store.ts'
import type { DraftStoreCommit } from './document-draft-store.ts'

export interface ComponentPropertyTarget { identity: string, memberId: string, blockId: string, stepId?: string }
export interface ComponentPropertyDraft {
  format: 1
  id: string
  revision: number
  target: ComponentPropertyTarget
  source: CanonicalSource
  definitionId: string
  baseline: JsonObject
  value: JsonObject
  reset: boolean
  composing: boolean
  updatedAt: string
}
export interface ComponentPropertyBackup { record: ComponentPropertyDraft, token: string, key: string }
export interface ComponentPropertyBackupRead { candidates: ComponentPropertyBackup[], unreadable: number }
interface Entry { record: ComponentPropertyDraft, store: DocumentDraftStore, operation?: DraftStoreCommit, failed: boolean, origins: ComponentPropertyBackup[] }
const PREFIX = 'presmium.component-properties.v1:'
const SETTLED = 'presmium.component-properties-settled.v1:'
const MAX_CHARS = 1 << 20
const scope = (target: ComponentPropertyTarget) => JSON.stringify([target.identity, target.memberId])
const targetKey = (target: ComponentPropertyTarget) => JSON.stringify([target.identity, target.memberId, target.blockId, target.stepId ?? null])
const prefix = (target: ComponentPropertyTarget) => `${PREFIX}${targetKey(target)}:`
const markerPrefix = (target: ComponentPropertyTarget) => `${SETTLED}${targetKey(target)}:`
const marker = (backup: ComponentPropertyBackup) => `${markerPrefix(backup.record.target)}${JSON.stringify([backup.record.id, backup.record.revision, backup.token])}`
const keyOf = (record: ComponentPropertyDraft) => `${prefix(record.target)}${record.id}`
const tokenOf = async (raw: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw)))].map(byte => byte.toString(16).padStart(2, '0')).join('')

function valid(value: unknown, target: ComponentPropertyTarget): value is ComponentPropertyDraft {
  return isRecord(value) && value.format === 1 && typeof value.id === 'string' && value.id.length > 0
    && Number.isSafeInteger(value.revision) && (value.revision as number) > 0 && isRecord(value.target)
    && value.target.identity === target.identity && value.target.memberId === target.memberId && value.target.blockId === target.blockId && value.target.stepId === target.stepId
    && isRecord(value.source) && typeof value.source.documentId === 'string' && typeof value.source.version === 'string' && typeof value.source.fingerprint === 'string'
    && typeof value.definitionId === 'string' && isRecord(value.baseline) && isRecord(value.value)
    && typeof value.reset === 'boolean' && typeof value.composing === 'boolean' && typeof value.updatedAt === 'string' && Number.isFinite(Date.parse(value.updatedAt))
}

/** Unapplied form input borrows the existing strict backup actor; only lecture.json is authoring content. */
export class ComponentPropertyDrafts {
  readonly #entries = new Map<string, Entry>()
  readonly #listeners = new Set<() => void>()
  readonly #revisions = new Map<string, number>()
  #revision = 0
  #closed = false
  readonly #leave = (event: BeforeUnloadEvent) => {
    if ([...this.#entries.values()].some(entry => entry.failed || entry.operation || entry.record.composing)) event.preventDefault()
  }
  constructor() { if (typeof window !== 'undefined') window.addEventListener('beforeunload', this.#leave) }
  subscribe = (listener: () => void): (() => void) => { this.#listeners.add(listener); return () => this.#listeners.delete(listener) }
  snapshot = (): number => this.#revision
  revision(identity: string, memberId: string): number { return this.#revisions.get(JSON.stringify([identity, memberId])) ?? 0 }
  #touch(target: ComponentPropertyTarget): void {
    if (this.#closed) return
    this.#revision++
    this.#revisions.set(scope(target), (this.#revisions.get(scope(target)) ?? 0) + 1)
    for (const listener of this.#listeners) listener()
  }
  get(target: ComponentPropertyTarget): ComponentPropertyDraft | undefined { return this.#entries.get(targetKey(target))?.record }
  canKeep(target: ComponentPropertyTarget): boolean { return !this.#closed && (this.#entries.has(targetKey(target)) || this.#entries.size < 512) }
  status(target: ComponentPropertyTarget): 'available' | 'pending' | 'session-only' {
    const entry = this.#entries.get(targetKey(target))
    return entry?.failed ? 'session-only' : entry?.operation ? 'pending' : 'available'
  }
  has(identity: string, memberId: string): boolean { return [...this.#entries.values()].some(entry => entry.record.target.identity === identity && entry.record.target.memberId === memberId) }

  keep(target: ComponentPropertyTarget, value: { source: CanonicalSource, definitionId: string, baseline: JsonObject, value: JsonObject, reset?: boolean, composing?: boolean }, origins: ComponentPropertyBackup[] = []): ComponentPropertyDraft {
    if (this.#closed) throw new Error('component-draft-closed')
    const key = targetKey(target), previous = this.#entries.get(key)
    if (!previous && this.#entries.size >= 512) throw new Error('component-draft-limit')
    const record: ComponentPropertyDraft = { format: 1, id: previous?.record.id ?? crypto.randomUUID(), revision: (previous?.record.revision ?? 0) + 1,
      target: structuredClone(target), source: structuredClone(value.source), definitionId: value.definitionId, baseline: structuredClone(value.baseline), value: structuredClone(value.value),
      reset: Boolean(value.reset), composing: Boolean(value.composing), updatedAt: new Date().toISOString() }
    const entry: Entry = previous ?? { record, store: new DocumentDraftStore(scope(target)), failed: false, origins: [] }
    entry.record = record
    for (const origin of origins) if (!entry.origins.some(candidate => candidate.key === origin.key && candidate.token === origin.token)) entry.origins.push(origin)
    this.#entries.set(key, entry)
    const raw = JSON.stringify(record)
    const operation = raw.length <= MAX_CHARS ? entry.store.put(keyOf(record), raw) : undefined
    entry.operation = operation
    entry.failed = !operation
    this.#touch(target)
    if (operation) void operation.done.then(result => {
      if (this.#closed || this.#entries.get(key) !== entry || entry.operation !== operation) return
      entry.operation = undefined; entry.failed = result !== 'committed'; this.#touch(target)
    })
    return record
  }

  /** Reads never settle a foreign backup or replace current input. Recovery is an explicit caller action. */
  async read(target: ComponentPropertyTarget, signal?: AbortSignal): Promise<ComponentPropertyBackupRead> {
    if (this.#closed) throw new Error('component-draft-closed')
    const reader = new DocumentDraftStore(scope(target))
    try {
      const stored = await reader.read([prefix(target), markerPrefix(target)], signal), result: ComponentPropertyBackup[] = []
      if (stored.size > 1024) throw new Error('component-draft-limit')
      let unreadable = 0
      for (const [key, raw] of stored) {
        signal?.throwIfAborted()
        if (!key.startsWith(prefix(target))) continue
        if (typeof raw !== 'string' || raw.length > MAX_CHARS) { unreadable++; continue }
        let record: unknown
        try { record = JSON.parse(raw) } catch { unreadable++; continue }
        if (!valid(record, target) || key !== keyOf(record)) { unreadable++; continue }
        const token = await tokenOf(raw), candidate = { record, token, key }
        signal?.throwIfAborted()
        if (stored.get(marker(candidate)) === token) continue
        const current = this.#entries.get(targetKey(target))
        if (current?.record.id === record.id || current?.origins.some(origin => origin.key === key && origin.token === token)) continue
        result.push(candidate)
      }
      return { candidates: result.sort((a, b) => b.record.updatedAt.localeCompare(a.record.updatedAt)), unreadable }
    } finally { reader.close() }
  }

  /** Recovery creates a confirmed branch before replacing the current in-memory draft. */
  async recover(backup: ComponentPropertyBackup, expected: ComponentPropertyDraft | undefined, signal?: AbortSignal): Promise<boolean> {
    const target = backup.record.target, key = targetKey(target), previous = this.#entries.get(key)
    const owns = () => !this.#closed && this.#entries.get(key) === previous && previous?.record === expected
      && this.status(target) === 'available' && this.canKeep(target)
    if (!owns()) return false
    const store = new DocumentDraftStore(scope(target))
    let adopted = false
    try {
      const values = await store.read([backup.key, marker(backup)], signal), raw = values.get(backup.key)
      if (typeof raw !== 'string' || raw.length > MAX_CHARS || await tokenOf(raw) !== backup.token || values.get(marker(backup)) === backup.token) return false
      signal?.throwIfAborted()
      if (!owns()) return false
      let value: unknown
      try { value = JSON.parse(raw) } catch { return false }
      if (!valid(value, target) || backup.key !== keyOf(value)) return false
      const record: ComponentPropertyDraft = { ...structuredClone(value), id: crypto.randomUUID(), revision: 1, composing: false, updatedAt: new Date().toISOString() }
      const fork = JSON.stringify(record)
      if (fork.length > MAX_CHARS) return false
      const operation = store.put(keyOf(record), fork)
      if (!operation || await operation.done !== 'committed') return false
      signal?.throwIfAborted()
      // A later keystroke retains ownership; the committed branch remains recoverable.
      if (!owns()) return false
      this.#entries.set(key, { record, store, failed: false, origins: [backup] })
      previous?.store.close()
      adopted = true; this.#touch(target)
      return true
    } finally { if (!adopted) store.close() }
  }

  /** Both the in-memory revision and strict storage owner must still match the acknowledged input. */
  async clear(expected: ComponentPropertyDraft): Promise<boolean> {
    const key = targetKey(expected.target), entry = this.#entries.get(key)
    if (this.#closed || !entry || entry.record !== expected) return false
    const operation = entry.store.remove(keyOf(expected), entry.origins.map(origin => [marker(origin), origin.token] as [string, string]))
    if (!operation) { entry.failed = true; this.#touch(expected.target); return false }
    entry.operation = operation; this.#touch(expected.target)
    const result = await operation.done
    if (this.#closed || this.#entries.get(key) !== entry) return false
    if (entry.operation === operation) { entry.operation = undefined; entry.failed = result !== 'committed' }
    if (result === 'committed' && entry.record === expected) { this.#entries.delete(key); entry.store.close(); this.#touch(expected.target); return true }
    this.#touch(expected.target)
    return false
  }

  /** A discarded foreign revision is marked exactly; newer input under that key remains recoverable. */
  async discard(backup: ComponentPropertyBackup, signal?: AbortSignal): Promise<boolean> {
    if (this.#closed) return false
    const reader = new DocumentDraftStore(scope(backup.record.target))
    try {
      const values = await reader.read([backup.key], signal), raw = values.get(backup.key)
      if (typeof raw !== 'string' || await tokenOf(raw) !== backup.token) return false
      signal?.throwIfAborted()
      const result = await reader.mark([[marker(backup), backup.token]])
      this.#touch(backup.record.target)
      return result
    } finally { reader.close() }
  }
  close(): void {
    if (this.#closed) return
    this.#closed = true
    if (typeof window !== 'undefined') window.removeEventListener('beforeunload', this.#leave)
    for (const entry of this.#entries.values()) entry.store.close()
    this.#listeners.clear()
  }
}
