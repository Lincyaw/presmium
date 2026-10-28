import { documentCommentTargets, isRecord, validateDocument, validateDocumentCommentAnchor } from '@lincyaw/kernel'
import type { DocumentComment, DocumentThread, RichTextNode, TeachingDocument } from '@lincyaw/kernel'
import { DocumentDraftStore } from '../document-draft-store.ts'
import type { DraftStoreResult } from '../document-draft-store.ts'

export interface CommentDraftTarget { threadId: string, commentId?: string, threadCreatedAt: string, commentCreatedAt?: string, baseline?: string }
export interface NewCommentDraftTarget { kind: 'create', intentId: string, documentId: string, anchor?: DocumentThread['anchor'], signature?: string }
export type CommentComposerTarget = CommentDraftTarget | NewCommentDraftTarget
export const isNewCommentDraft = (target: CommentComposerTarget): target is NewCommentDraftTarget => 'kind' in target && target.kind === 'create'
export function newCommentDraftSignature(document: TeachingDocument, anchor: DocumentThread['anchor']): string | undefined {
  if (!anchor) return
  try {
    validateDocumentCommentAnchor(document, anchor)
    const targets = documentCommentTargets(document), from = targets.get(anchor.from.blockId)!, to = targets.get(anchor.to.blockId)!
    return JSON.stringify([...targets].filter(([, value]) => value.order >= from.order && value.order <= to.order).map(([id, value]) => ({ id, text: value.text })))
  } catch { return }
}
export interface CommentDraftReference { id: string, revision: number, token: string }
export interface CommentDraftRecord {
  format: 1
  scope: string
  id: string
  owner: string
  revision: number
  updatedAt: number
  target: CommentComposerTarget
  version: string
  content: RichTextNode[]
  composing: boolean
  pending?: { commentId: string, value: string, threadId?: string, threadCreatedAt?: string }
}
export interface CommentDraftCandidate extends CommentDraftRecord { token: string, storage: 'durable' | 'session' }
export interface CommentDraftState { candidates: readonly CommentDraftCandidate[], pending: boolean, failed: boolean, reading: boolean }
export interface CommentDraftOperation { signal?: AbortSignal, guard?(): void }
export interface CommentDraftComposer {
  id: string
  target: CommentComposerTarget
  snapshot(): { record?: CommentDraftRecord, composing: boolean, available: boolean }
  targetState(): 'current' | 'changed' | 'unavailable'
  restore?(candidate: CommentDraftCandidate, operation: CommentDraftOperation): Promise<CommentDraftRecord | undefined>
}
interface Writing { record: CommentDraftRecord, raw: string, store: DocumentDraftStore, generation: number, pending: boolean, failed: boolean, done: Promise<DraftStoreResult>, clearing?: boolean }
const PREFIX = 'presmium.comment-draft.v1:'
const SETTLED = 'presmium.comment-draft-settled.v1:'
const MAX_CHARS = 1 << 20
const prefix = (scope: string) => `${PREFIX}${JSON.stringify(scope)}:`
const markerPrefix = (scope: string) => `${SETTLED}[${JSON.stringify(scope)},`
const keyOf = (scope: string, id: string) => `${prefix(scope)}${id}`
const markerOf = (scope: string, value: CommentDraftReference) => `${SETTLED}${JSON.stringify([scope, value.id, value.revision, value.token])}`
export const commentDraftBaseline = (comment: DocumentComment) => JSON.stringify({ userId: comment.userId, content: comment.content })
const committedValue = (comment: DocumentComment) => JSON.stringify({ id: comment.id, userId: comment.userId, createdAt: comment.createdAt, updatedAt: comment.updatedAt, content: comment.content })
export const sameCommentDraftTarget = (a: CommentComposerTarget, b: CommentComposerTarget) => isNewCommentDraft(a) || isNewCommentDraft(b)
  ? isNewCommentDraft(a) && isNewCommentDraft(b) && a.documentId === b.documentId && a.signature === b.signature && JSON.stringify(a.anchor) === JSON.stringify(b.anchor)
  : a.threadId === b.threadId && a.commentId === b.commentId && a.threadCreatedAt === b.threadCreatedAt && a.commentCreatedAt === b.commentCreatedAt
async function tokenOf(raw: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))
  return [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, '0')).join('')
}
const point = (value: unknown): boolean => isRecord(value) && typeof value.blockId === 'string' && value.blockId.length > 0 && value.blockId.length <= 205 && Number.isSafeInteger(value.offset) && Number(value.offset) >= 0
function targetShape(value: unknown): boolean {
  if (!isRecord(value)) return false
  if (value.kind === 'create') return typeof value.intentId === 'string' && value.intentId.length > 0 && value.intentId.length <= 200
    && typeof value.documentId === 'string' && value.documentId.length > 0 && value.documentId.length <= 200
    && (value.anchor === undefined && value.signature === undefined || isRecord(value.anchor) && point(value.anchor.from) && point(value.anchor.to) && typeof value.signature === 'string')
  return typeof value.threadId === 'string' && typeof value.threadCreatedAt === 'string'
    && (value.commentId === undefined || typeof value.commentId === 'string' && typeof value.commentCreatedAt === 'string' && typeof value.baseline === 'string')
}
function valid(value: unknown, scope: string): value is CommentDraftRecord {
  return isRecord(value) && value.format === 1 && value.scope === scope && typeof value.id === 'string' && value.id.length > 0 && value.id.length <= 200
    && typeof value.owner === 'string' && value.owner.length > 0 && value.owner.length <= 200 && Number.isSafeInteger(value.revision) && Number(value.revision) > 0
    && Number.isSafeInteger(value.updatedAt) && Number(value.updatedAt) >= 0 && typeof value.version === 'string' && value.version.length > 0 && value.version.length <= 200
    && targetShape(value.target) && Array.isArray(value.content) && value.content.length > 0 && value.content.every(node => isRecord(node) && typeof node.id === 'string' && typeof node.type === 'string')
    && typeof value.composing === 'boolean' && (value.pending === undefined || isRecord(value.pending) && typeof value.pending.commentId === 'string' && typeof value.pending.value === 'string'
      && (value.pending.threadId === undefined || typeof value.pending.threadId === 'string' && typeof value.pending.threadCreatedAt === 'string'))
}

/** Native composer backups use the document backup owner's strict transactions, never the source writer. */
export class CommentDrafts {
  readonly #scope: string
  readonly #owner = crypto.randomUUID()
   #reader?: DocumentDraftStore
  readonly #listeners = new Set<() => void>()
  readonly #writing = new Map<string, Writing>()
  readonly #composers = new Map<string, CommentDraftComposer>()
  #state: CommentDraftState = { candidates: [], pending: false, failed: false, reading: true }
  #closed = false
  #started = false
  #read = 0
  #document?: TeachingDocument
  #version?: string
  #acknowledged = false
  #revision = 0
  #settling = 0
  #unregisteredComposers = 0
  readonly #changed?: () => void
  #readFailure = false
  #admissionFailure = false
  constructor(identity: string, memberId: string, changed?: () => void) {
    this.#scope = JSON.stringify([identity, memberId])
    this.#changed = changed
  }
  registerComposer(composer: CommentDraftComposer): () => void {
    if (this.#closed) return () => {}
    if (this.#composers.size >= 64 || this.#composers.has(composer.id)) {
      this.#unregisteredComposers++; this.#touch()
      let released = false
      return () => { if (!released) { released = true; if (!this.#closed) { this.#unregisteredComposers--; this.#touch() } } }
    }
    this.#composers.set(composer.id, composer); this.#touch()
    return () => { if (this.#composers.get(composer.id) === composer) { this.#composers.delete(composer.id); this.#touch() } }
  }
  composer(id: string): CommentDraftComposer | undefined { return this.#closed ? undefined : this.#composers.get(id) }
  get ownersKnown(): boolean { return !this.#closed && this.#unregisteredComposers === 0 }
  hasRestoreComposer(): boolean { return this.ownersKnown && [...this.#composers.values()].some(value => value.restore && value.snapshot().available) }
  targetActive(target: CommentComposerTarget): boolean { return !this.ownersKnown || [...this.#composers.values()].some(value => sameCommentDraftTarget(value.target, target) && value.snapshot().available) }
  activeRecord(record: CommentDraftRecord): boolean { return [...this.#composers.values()].some(value => value.snapshot().record?.id === record.id && value.snapshot().record?.revision === record.revision && value.snapshot().available) }
  owns(record: CommentDraftRecord): boolean { return !this.#closed && this.#writing.get(record.id)?.record === record }
  async restoreChoice(candidate: CommentDraftCandidate, signal: AbortSignal): Promise<{ composerId: string, expectedCurrent: CommentDraftReference | null } | undefined> {
    if (!this.ownersKnown || isNewCommentDraft(candidate.target) || candidate.storage !== 'durable' || candidate.composing || candidate.pending) return
    const matching = [...this.#composers.values()].filter(value => value.restore && sameCommentDraftTarget(value.target, candidate.target) && value.snapshot().available && !value.snapshot().composing && value.targetState() !== 'unavailable')
    if (matching.length !== 1) return
    const composer = matching[0]!, current = composer.snapshot().record
    if (!current) return { composerId: composer.id, expectedCurrent: null }
    const writing = this.#writing.get(current.id)
    if (current.id === candidate.id || current.composing || current.pending || !writing || writing.record !== current || writing.pending || writing.failed || !writing.store.owns(keyOf(this.#scope, current.id), writing.raw)) return
    const token = await tokenOf(writing.raw); signal.throwIfAborted()
    if (this.#composers.get(composer.id) !== composer || composer.snapshot().record !== current || !composer.snapshot().available || composer.snapshot().composing) throw new Error('client-comment-drafts-changed')
    return { composerId: composer.id, expectedCurrent: { id: current.id, revision: current.revision, token } }
  }
  get revision(): number { return this.#revision }
  get readable(): boolean { return !this.#closed && !this.#settling && this.#started && Boolean(this.#reader && this.#document && this.#version) }
  #touch(): void { if (!this.#closed) { this.#revision++; this.#changed?.() } }
  start(): void {
    if (this.#closed || this.#started) return
    this.#started = true
    this.#reader = new DocumentDraftStore(this.#scope, () => { this.#touch(); void this.refresh() }, { family: 'comment', owner: this.#owner })
    this.#touch()
    if (typeof window !== 'undefined') window.addEventListener('beforeunload', this.#leave)
    void this.refresh()
  }
  readonly #leave = (event: BeforeUnloadEvent) => { if (this.#state.pending || this.#state.failed || [...this.#writing.values()].some(value => value.record.composing)) event.preventDefault() }
  snapshot = (): CommentDraftState => this.#state
  subscribe = (listener: () => void): (() => void) => { this.#listeners.add(listener); return () => this.#listeners.delete(listener) }

  /** Explicit agent reads borrow the original reader; they never settle, restore or discard a backup. */
  async readForAgent(signal: AbortSignal, reference?: CommentDraftReference): Promise<{ revision: number, candidates: CommentDraftCandidate[], coverage: 'stored-and-session' | 'session-only', skippedInvalid: number }> {
    signal.throwIfAborted()
    if (!this.readable || !this.#reader) throw new Error('client-comment-drafts-unavailable')
    const revision = this.#revision, writing = new Map(this.#writing), key = reference ? keyOf(this.#scope, reference.id) : undefined
    const known = reference && writing.get(reference.id)
    if (known && known.record.revision !== reference!.revision) throw new Error('client-comment-draft-changed')
    const current = () => { signal.throwIfAborted(); if (this.#closed || revision !== this.#revision) throw new Error('client-comment-drafts-changed') }
    let stored: Map<string, unknown>, coverage: 'stored-and-session' | 'session-only' = 'stored-and-session'
    try { stored = await this.#reader.read(key ? [key, markerOf(this.#scope, reference!)] : [prefix(this.#scope), markerPrefix(this.#scope)], signal) }
    catch (error) { current(); if (reference ? !known : writing.size === 0) throw new Error('client-comment-drafts-unavailable'); stored = new Map(); coverage = 'session-only' }
    current()
    const entries = new Map<string, { raw: unknown, storage: 'durable' | 'session' }>()
    for (const [name, raw] of stored) if (name.startsWith(prefix(this.#scope)) && (!key || name === key)) entries.set(name, { raw, storage: 'durable' })
    // A newer in-memory version always shadows its older IndexedDB value, including failed admission.
    for (const [id, value] of writing) if (!reference || id === reference.id) entries.set(keyOf(this.#scope, id), { raw: value.raw, storage: stored.get(keyOf(this.#scope, id)) === value.raw ? 'durable' : 'session' })
    const candidates: CommentDraftCandidate[] = []
    let skippedInvalid = 0
    for (const [name, entry] of entries) {
      try {
        if (typeof entry.raw !== 'string' || entry.storage === 'durable' && entry.raw.length > MAX_CHARS) throw new Error('comment-draft-data')
        const value: unknown = JSON.parse(entry.raw)
        if (!valid(value, this.#scope) || name !== keyOf(this.#scope, value.id) || !this.#validContent(value)) throw new Error('comment-draft-data')
        const token = await tokenOf(entry.raw)
        current()
        const marked = stored.get(markerOf(this.#scope, { id: value.id, revision: value.revision, token })) === token
        if (marked && !writing.has(value.id) || this.#isCommitted(value)) continue
        if (reference && (value.revision !== reference.revision || token !== reference.token)) throw new Error('client-comment-draft-changed')
        candidates.push({ ...value, token, storage: marked ? 'session' : entry.storage })
      } catch (error) { current(); if (reference) throw new Error('client-comment-draft-changed'); skippedInvalid++ }
    }
    current()
    if (reference && candidates.length !== 1) throw new Error('client-comment-draft-changed')
    return { revision, candidates: candidates.sort((a, b) => a.id.localeCompare(b.id)), coverage, skippedInvalid }
  }
  #emit(patch: Partial<CommentDraftState>): void {
    if (this.#closed) return
    this.#state = { ...this.#state, ...patch }
    for (const listener of this.#listeners) listener()
  }
  #pending(): void { this.#emit({ pending: [...this.#writing.values()].some(value => value.pending), failed: this.#readFailure || this.#admissionFailure || [...this.#writing.values()].some(value => value.failed) }) }
  #validContent(value: CommentDraftRecord): boolean {
    if (!this.#document) return false
    const target = value.target, id = isNewCommentDraft(target) ? `validation:${value.id}` : target.threadId, time = isNewCommentDraft(target) ? new Date(value.updatedAt).toISOString() : target.threadCreatedAt
    const document = { ...this.#document, comments: { [id]: { id, type: 'thread' as const, createdAt: time, updatedAt: time, resolved: false, comments: [{ id: value.id, type: 'comment' as const, userId: value.owner, createdAt: time, updatedAt: time, content: value.content, reactions: [] }] } } }
    const result = validateDocument(document)
    return Boolean(result.document && !result.issues.some(issue => issue.severity === 'error'))
  }
  async confirm(record: CommentDraftRecord): Promise<boolean> {
    const value = this.#writing.get(record.id)
    if (!value || value.record.revision !== record.revision || this.#closed) return false
    const result = await value.done
    return !this.#closed && result === 'committed' && this.#writing.get(record.id) === value && value.store.owns(keyOf(this.#scope, record.id), value.raw)
  }
  async refresh(): Promise<void> {
    if (!this.#reader || this.#closed) return
    const read = ++this.#read
    try {
      const values = await this.#reader.read([prefix(this.#scope), markerPrefix(this.#scope)]), candidates: CommentDraftCandidate[] = []
      const entries: [string, unknown, 'durable' | 'session'][] = [...values].map(([key, raw]) => [key, raw, 'durable'])
      for (const value of this.#writing.values()) if (values.get(keyOf(this.#scope, value.record.id)) !== value.raw) entries.push([keyOf(this.#scope, value.record.id), value.raw, 'session'])
      let failed = false
      for (const [key, raw, storage] of entries) if (key.startsWith(prefix(this.#scope))) {
        try {
          if (typeof raw !== 'string' || storage === 'durable' && raw.length > MAX_CHARS) throw new Error('comment-draft-size')
          const value: unknown = JSON.parse(raw)
          if (!valid(value, this.#scope) || key !== keyOf(this.#scope, value.id) || !this.#validContent(value)) throw new Error('comment-draft-data')
          const token = await tokenOf(raw)
          if (this.#closed || read !== this.#read) return
          if (values.get(markerOf(this.#scope, { id: value.id, revision: value.revision, token })) === token) continue
          if (this.#isCommitted(value)) { if (await this.#reader!.mark([[markerOf(this.#scope, { id: value.id, revision: value.revision, token }), token]])) this.#touch(); continue }
          candidates.push({ ...value, token, storage })
        } catch { failed = true }
      }
      if (!this.#closed && read === this.#read) { this.#readFailure = failed; this.#emit({ candidates: candidates.sort((a, b) => b.updatedAt - a.updatedAt), reading: false }); this.#pending() }
    } catch {
      const candidates = await Promise.all([...this.#writing.values()].map(async value => ({ ...value.record, token: await tokenOf(value.raw), storage: 'session' as const })))
      if (!this.#closed && read === this.#read) { this.#readFailure = true; this.#emit({ candidates, reading: false }); this.#pending() }
    }
  }
  #isCommitted(record: CommentDraftRecord): boolean {
    if (!this.#acknowledged || !record.pending || !this.#document || !this.#version || record.version === this.#version) return false
    const target = record.target, created = isNewCommentDraft(target)
    const thread = this.#document.comments?.[created ? record.pending.threadId ?? '' : target.threadId]
    const comment = thread?.comments.find(value => value.id === record.pending!.commentId)
    return Boolean(thread && !thread.deletedAt && thread.createdAt === (created ? record.pending.threadCreatedAt : target.threadCreatedAt)
      && (!created || JSON.stringify(thread.anchor) === JSON.stringify(target.anchor)) && comment && !comment.deletedAt && committedValue(comment) === record.pending.value)
  }
  synchronize(document: TeachingDocument, version: string | undefined, acknowledged = false): void {
    this.#document = document; this.#version = version; this.#acknowledged = acknowledged
    for (const value of this.#writing.values()) if (this.#isCommitted(value.record)) void this.clearOwn(value.record)
    if (this.#started) void this.refresh()
  }
  write(target: CommentComposerTarget, version: string, content: RichTextNode[], composing: boolean, previous?: CommentDraftRecord): CommentDraftRecord | undefined {
    if (this.#closed) return
    const known = previous && this.#writing.get(previous.id)
    if (previous && (known && known.record.revision !== previous.revision || previous.owner !== this.#owner)) return
    const branched = known?.store.conflicted(keyOf(this.#scope, known.record.id))
    const record: CommentDraftRecord = { format: 1, scope: this.#scope, id: !branched && known ? known.record.id : crypto.randomUUID(), owner: this.#owner,
      revision: !branched && known ? known.record.revision + 1 : 1, updatedAt: Date.now(), target: structuredClone(target), version, content: structuredClone(content), composing }
    return this.#put(record, !branched ? known : undefined)
  }
  #put(record: CommentDraftRecord, previous?: Writing): CommentDraftRecord | undefined {
    const raw = JSON.stringify(record)
    const store = previous?.store ?? new DocumentDraftStore(this.#scope, undefined, { family: 'comment', owner: this.#owner }), commit = raw.length <= MAX_CHARS ? store.put(keyOf(this.#scope, record.id), raw) : undefined
    if (!commit) {
      // Keep the latest native bytes in this Workbench even when durable admission is refused.
      this.#writing.set(record.id, { record, raw, store, generation: 0, pending: false, failed: true, done: Promise.resolve('failed') })
      this.#touch()
      this.#pending(); void this.refresh()
      return record
    }
    const writing: Writing = { record, raw, store, generation: commit.generation, pending: true, failed: previous?.failed ?? false, done: commit.done }
    this.#writing.set(record.id, writing); this.#touch(); this.#pending()
    void commit.done.then(result => {
      if (this.#closed || this.#writing.get(record.id) !== writing) return
      writing.pending = false
      writing.failed = result === 'failed'; this.#admissionFailure = false; this.#pending()
      this.#touch()
      void this.refresh()
    })
    return record
  }
  submitted(record: CommentDraftRecord | undefined, comment: DocumentComment | undefined, thread?: DocumentThread): void {
    if (!record || !comment || this.#closed) return
    const value = this.#writing.get(record.id)
    if (!value || value.record.revision !== record.revision) return
    this.#put({ ...record, revision: record.revision + 1, pending: { commentId: comment.id, value: committedValue(comment), ...thread ? { threadId: thread.id, threadCreatedAt: thread.createdAt } : {} } }, value)
  }
  async clearOwn(record: CommentDraftRecord): Promise<boolean> {
    const value = this.#writing.get(record.id)
    if (!value || value.clearing || value.record.revision !== record.revision || record.owner !== this.#owner || this.#closed) return false
    value.clearing = true; this.#settling++; this.#touch()
    try {
    const commit = value.store.remove(keyOf(this.#scope, record.id), [])
    if (!commit) return false
    value.pending = true; this.#pending()
    const result = await commit.done
    if (this.#closed || this.#writing.get(record.id) !== value) return false
    value.pending = false
    if (result === 'committed' && value.record.revision === record.revision) { this.#writing.delete(record.id); this.#touch(); value.store.close() }
    else if (result === 'failed') this.#admissionFailure = true
    this.#pending(); void this.refresh()
    return result === 'committed'
    } finally { value.clearing = false; this.#settling--; this.#touch() }
  }
  async discard(reference: CommentDraftReference, operation?: CommentDraftOperation): Promise<boolean> {
    operation?.signal?.throwIfAborted(); operation?.guard?.()
    if (this.#closed || !this.#reader) return false
    this.#settling++; this.#touch()
    try {
    if (this.#closed || !this.#reader) return false
    const values = await this.#reader.read([prefix(this.#scope)], operation?.signal), writing = this.#writing.get(reference.id)
    const raw = writing && writing.record.revision === reference.revision && await tokenOf(writing.raw) === reference.token ? writing.raw : values.get(keyOf(this.#scope, reference.id))
    if (this.#closed || typeof raw !== 'string' || await tokenOf(raw) !== reference.token) return false
    const value: unknown = JSON.parse(raw)
    if (!valid(value, this.#scope) || value.revision !== reference.revision || this.#closed) return false
    operation?.signal?.throwIfAborted(); operation?.guard?.()
    const committed = await this.#reader!.mark([[markerOf(this.#scope, reference), reference.token]])
    operation?.signal?.throwIfAborted(); operation?.guard?.()
    if (!this.#closed) {
      if (committed) this.#touch()
      if (committed && writing && this.#writing.get(reference.id) === writing && writing.record.revision === reference.revision && await tokenOf(writing.raw) === reference.token) { this.#writing.delete(reference.id); writing.store.close() }
      if (!committed) this.#admissionFailure = true
      this.#pending(); await this.refresh()
    }
    return committed
    } catch (error) { if (operation) throw error; this.#readFailure = true; this.#pending(); return false }
    finally { this.#settling--; this.#touch() }
  }
  async recover(reference: CommentDraftReference, target: CommentComposerTarget, version: string, operation?: CommentDraftOperation): Promise<CommentDraftRecord | undefined> {
    operation?.signal?.throwIfAborted(); operation?.guard?.()
    if (this.#closed || !this.#reader) return
    this.#settling++; this.#touch()
    try {
      const values = await this.#reader.read([prefix(this.#scope)], operation?.signal), writing = this.#writing.get(reference.id)
      const raw = writing && writing.record.revision === reference.revision && await tokenOf(writing.raw) === reference.token ? writing.raw : values.get(keyOf(this.#scope, reference.id))
      if (this.#closed || typeof raw !== 'string' || await tokenOf(raw) !== reference.token || values.get(markerOf(this.#scope, reference)) === reference.token) return
      const value: unknown = JSON.parse(raw)
      if (!valid(value, this.#scope) || value.revision !== reference.revision || !sameCommentDraftTarget(value.target, target) || !this.#validContent(value) || this.#closed) return
      operation?.signal?.throwIfAborted(); operation?.guard?.()
      const record: CommentDraftRecord = { ...value, target: isNewCommentDraft(target) ? structuredClone(target) : value.target, id: crypto.randomUUID(), owner: this.#owner, revision: 1, updatedAt: Date.now(), version, composing: false, pending: undefined }
      const store = new DocumentDraftStore(this.#scope, undefined, { family: 'comment', owner: this.#owner }), next = JSON.stringify(record)
      if (next.length > MAX_CHARS || !await store.create(keyOf(this.#scope, record.id), next) || this.#closed) { store.close(); if (!this.#closed) { this.#admissionFailure = true; this.#pending() }; return }
      try { operation?.signal?.throwIfAborted(); operation?.guard?.() } catch (error) { store.close(); throw error }
      this.#writing.set(record.id, { record, raw: next, store, generation: 0, pending: false, failed: false, done: Promise.resolve('committed') })
      this.#touch(); void this.refresh()
      return record
    } catch (error) { if (operation) throw error; this.#readFailure = true; this.#pending(); return }
    finally { this.#settling--; this.#touch() }
  }
  close(): void {
    if (this.#closed) return
    this.#closed = true; ++this.#read
    if (typeof window !== 'undefined') window.removeEventListener('beforeunload', this.#leave)
    this.#reader?.close()
    for (const value of this.#writing.values()) value.store.close()
    this.#listeners.clear(); this.#composers.clear()
  }
}

/** Workbench lifetime keeps unpublished session material when a document surface unmounts. */
export class CommentDraftBank {
  readonly #documents = new Map<string, CommentDrafts>()
  readonly #listeners = new Set<() => void>()
  #closed = false
  get(identity: string, memberId: string): CommentDrafts | undefined {
    if (this.#closed) return
    const key = JSON.stringify([identity, memberId])
    let value = this.#documents.get(key)
    if (!value) { value = new CommentDrafts(identity, memberId, () => { for (const listener of this.#listeners) listener() }); this.#documents.set(key, value) }
    return value
  }
  peek(identity: string, memberId: string): CommentDrafts | undefined { return this.#closed ? undefined : this.#documents.get(JSON.stringify([identity, memberId])) }
  subscribe(listener: () => void): () => void { this.#listeners.add(listener); return () => this.#listeners.delete(listener) }
  close(): void { this.#closed = true; this.#listeners.clear(); for (const value of this.#documents.values()) value.close(); this.#documents.clear() }
}
