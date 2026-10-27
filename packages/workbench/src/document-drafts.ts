import { isRecord, validateDocument } from '@lincyaw/kernel'
import type { TeachingDocument } from '@lincyaw/kernel'
import { DocumentDraftStore } from './document-draft-store.ts'
import type { DraftStoreCommit } from './document-draft-store.ts'

export interface DocumentDraftReference { id: string, revision: number, token: string }
export interface DocumentDraft {
  content: TeachingDocument
  baseVersion: string
  baseHash: string
  input: number
  pendingHash?: string
  composing?: boolean
  origins?: DocumentDraftReference[]
}
export interface StoredDocumentDraft extends DocumentDraft {
  format: 2
  identity: string
  id: string
  owner: string
  revision: number
  updatedAt: number
}
export interface RecoverableDocumentDraft extends StoredDocumentDraft { token: string, source: 'durable' | 'rescue', owned: boolean }
export interface DocumentDraftChoice extends DocumentDraftReference { updatedAt: number, baseVersion: string, source: 'durable' | 'rescue' }
export interface DocumentDraftCommit extends DraftStoreCommit { record: StoredDocumentDraft, clearing: boolean }

const PREFIX = 'presmium.document.v2:'
const SETTLED = 'presmium.document-settled.v1:'
const MAX_CHARS = 8 << 20
const prefix = (identity: string) => `${PREFIX}${JSON.stringify(identity)}:`
const markerPrefix = (identity: string) => `${SETTLED}[${JSON.stringify(identity)},`
const keyOf = (identity: string, id: string) => `${prefix(identity)}${id}`
const settledKey = (identity: string, value: DocumentDraftReference) => `${SETTLED}${JSON.stringify([identity, value.id, value.revision, value.token])}`
const idRevision = (value: unknown): value is Record<string, unknown> & { id: string, revision: number } => isRecord(value) && typeof value.id === 'string' && value.id.length > 0 && value.id.length <= 200 && Number.isSafeInteger(value.revision) && (value.revision as number) > 0
const reference = (value: unknown): value is DocumentDraftReference => idRevision(value) && 'token' in value && typeof value.token === 'string' && /^[a-f0-9]{64}$/.test(value.token)
const draftShape = (value: unknown): value is DocumentDraft => isRecord(value) && typeof value.baseVersion === 'string' && value.baseVersion.length > 0 && value.baseVersion.length <= 200 && typeof value.baseHash === 'string' && value.baseHash.length > 0
  && Number.isSafeInteger(value.input) && (value.input as number) >= 0 && (value.pendingHash === undefined || typeof value.pendingHash === 'string')
  && (value.composing === undefined || typeof value.composing === 'boolean') && (value.origins === undefined || Array.isArray(value.origins) && value.origins.length <= 1024 && value.origins.every(reference))

function documentDraft(value: unknown, documentId: string): DocumentDraft | undefined {
  if (!draftShape(value)) return
  const checked = validateDocument(value.content)
  if (!checked.document || checked.document.id !== documentId || checked.issues.some(issue => issue.severity === 'error')) return
  return { content: checked.document, baseVersion: value.baseVersion, baseHash: value.baseHash, input: value.input,
    pendingHash: value.pendingHash, composing: value.composing, origins: value.origins }
}
async function tokenOf(raw: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))
  return [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, '0')).join('')
}

/** Strictly committed document backups, with old localStorage copies identified as unconfirmed rescue material. */
export class DocumentDrafts {
  readonly #owner = crypto.randomUUID()
  readonly #owned = new Map<string, { identity: string, revision: number, raw: string }>()
  #store?: DocumentDraftStore
  #identity?: string
  #closed = false
  readonly #changed?: () => void
  constructor(changed?: () => void) { this.#changed = changed }

  #storage(identity: string): DocumentDraftStore | undefined {
    if (this.#closed || this.#identity !== undefined && this.#identity !== identity) return
    this.#identity = identity
    return this.#store ??= new DocumentDraftStore(identity, this.#changed)
  }
  matches(identity: string, key: string | null): boolean { return key === null || key.startsWith(prefix(identity)) || key.startsWith(markerPrefix(identity)) }

  async read(identity: string, documentId: string): Promise<{ records: RecoverableDocumentDraft[], failed: boolean }> {
    const store = this.#storage(identity), values: { key: string, raw: unknown, source: 'durable' | 'rescue' }[] = []
    let failed = false, durable = new Map<string, unknown>()
    if (!store) return { records: [], failed: true }
    try {
      durable = await store.read([prefix(identity), markerPrefix(identity)])
      for (const [key, raw] of durable) if (key.startsWith(prefix(identity))) values.push({ key, raw, source: 'durable' })
    } catch { failed = true }
    // Existing localStorage input is never removed or silently treated as a strict commit.
    try {
      const keys: string[] = []
      for (let index = 0; index < localStorage.length; index++) {
        const key = localStorage.key(index)
        if (key?.startsWith(prefix(identity))) keys.push(key)
      }
      for (const key of keys) {
        const raw = localStorage.getItem(key)
        if (raw !== null) values.push({ key, raw, source: 'rescue' })
      }
    } catch { failed = true }
    const records = new Map<string, RecoverableDocumentDraft>()
    for (const { key, raw, source } of values) {
      try {
        if (typeof raw !== 'string' || raw.length > MAX_CHARS) throw new Error('document-draft-size')
        const value: unknown = JSON.parse(raw)
        if (!isRecord(value) || value.format !== 2 || value.identity !== identity || !idRevision(value) || key !== keyOf(identity, value.id)
          || typeof value.owner !== 'string' || !value.owner || value.owner.length > 200 || typeof value.updatedAt !== 'number' || !Number.isSafeInteger(value.updatedAt) || value.updatedAt < 0 || Number.isNaN(new Date(value.updatedAt).getTime())) throw new Error('document-draft-data')
        const draft = documentDraft(value, documentId)
        if (!draft) throw new Error('document-draft-document')
        const token = await tokenOf(raw), marker = settledKey(identity, { id: value.id, revision: value.revision, token })
        if (durable.get(marker) === token) continue
        if (source === 'rescue' && localStorage.getItem(marker) === token) continue
        const id = JSON.stringify([value.id, value.revision, token])
        if (!records.has(id)) records.set(id, { ...draft, format: 2, identity, id: value.id, owner: value.owner, revision: value.revision, updatedAt: value.updatedAt, token, source,
          owned: source === 'durable' && value.owner === this.#owner && (this.#owned.get(value.id)?.raw === raw || store.owns(key, raw)) })
      } catch { failed = true }
    }
    return { records: [...records.values()], failed }
  }

  #record(identity: string, draft: DocumentDraft, previous?: StoredDocumentDraft): { record: StoredDocumentDraft, raw: string } | undefined {
    const store = this.#storage(identity)
    if (!store || !draftShape(draft)) return
    const owned = previous && this.#owned.get(previous.id)
    if (previous && (!owned || owned.identity !== identity || previous.owner !== this.#owner || previous.revision !== owned.revision)) return
    const changed = previous && store.conflicted(keyOf(identity, previous.id))
    const record: StoredDocumentDraft = { ...draft, format: 2, identity, id: !changed && previous ? previous.id : crypto.randomUUID(), owner: this.#owner, revision: changed ? 1 : (owned?.revision ?? 0) + 1, updatedAt: Date.now() }
    if (!Number.isSafeInteger(record.revision)) return
    try { const raw = JSON.stringify(record); return raw.length <= MAX_CHARS ? { record, raw } : undefined }
    catch { return }
  }

  /** Admission is immediate; only done='committed' confirms a durable backup. */
  write(identity: string, draft: DocumentDraft, previous?: StoredDocumentDraft): DocumentDraftCommit | undefined {
    const next = this.#record(identity, draft, previous)
    if (!next) return
    const commit = this.#store!.put(keyOf(identity, next.record.id), next.raw)
    if (!commit) return
    this.#owned.set(next.record.id, { identity, revision: next.record.revision, raw: next.raw })
    if (previous && previous.id !== next.record.id) this.archive(previous)
    return { ...commit, record: next.record, clearing: false }
  }

  async fork(identity: string, draft: DocumentDraft): Promise<StoredDocumentDraft | undefined> {
    const next = this.#record(identity, draft)
    if (!next || !await this.#store!.create(keyOf(identity, next.record.id), next.raw)) return
    this.#owned.set(next.record.id, { identity, revision: next.record.revision, raw: next.raw })
    return next.record
  }

  /** Immutable, revision-specific markers never delete another tab's newer record. */
  async settle(identity: string, values: readonly DocumentDraftReference[]): Promise<boolean> {
    const store = this.#storage(identity)
    return Boolean(store && await store.mark(values.map(value => [settledKey(identity, value), value.token])))
  }

  remove(identity: string, record: StoredDocumentDraft, origins: readonly DocumentDraftReference[]): DocumentDraftCommit | undefined {
    const owned = this.#owned.get(record.id), store = this.#storage(identity)
    if (!store || !owned || owned.identity !== identity || record.owner !== this.#owner || owned.revision !== record.revision) return
    const commit = store.remove(keyOf(identity, record.id), origins.map(value => [settledKey(identity, value), value.token]))
    if (!commit) return
    void commit.done.then(result => { if (result === 'committed' && this.#owned.get(record.id)?.revision === record.revision) this.#owned.delete(record.id) })
    return { ...commit, record, clearing: true }
  }

  /** The old tab-local snapshot is removed only after a validated strict copy exists. */
  async migrate(identity: string, documentId: string, legacyKey: string): Promise<'read' | 'write' | undefined> {
    let raw: string | null, draft: DocumentDraft | undefined
    try {
      raw = sessionStorage.getItem(legacyKey)
      if (raw === null) return
      if (raw.length > MAX_CHARS) return 'read'
      draft = documentDraft(JSON.parse(raw), documentId)
      if (!draft) return 'read'
    } catch { return 'read' }
    try {
      const found = (await this.read(identity, documentId)).records.find(record => record.source === 'durable' && record.baseVersion === draft.baseVersion && record.baseHash === draft.baseHash
        && record.input === draft.input && record.pendingHash === draft.pendingHash && Boolean(record.composing) === Boolean(draft.composing) && JSON.stringify(record.content) === JSON.stringify(draft.content))
      const latest = sessionStorage.getItem(legacyKey)
      if (latest !== raw) return latest === null ? undefined : 'read'
      if (!found && !await this.fork(identity, draft)) return 'write'
    } catch { return 'read' }
    try { if (sessionStorage.getItem(legacyKey) === raw) sessionStorage.removeItem(legacyKey) }
    catch { /* The strict copy exists; keep the old bytes if cleanup is unavailable. */ }
  }

  close(): void { this.#closed = true; this.#store?.close() }
  archive(record: StoredDocumentDraft): void { this.#owned.delete(record.id); this.#store?.release(keyOf(record.identity, record.id)) }
}
