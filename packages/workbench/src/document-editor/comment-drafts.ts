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
interface Writing { record: CommentDraftRecord, raw: string, store: DocumentDraftStore, generation: number, pending: boolean, failed: boolean, done: Promise<DraftStoreResult> }
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
  #state: CommentDraftState = { candidates: [], pending: false, failed: false, reading: true }
  #closed = false
  #started = false
  #read = 0
  #document?: TeachingDocument
  #version?: string
  #acknowledged = false
  #readFailure = false
  #admissionFailure = false
  constructor(identity: string, memberId: string) {
    this.#scope = JSON.stringify([identity, memberId])
  }
  start(): void {
    if (this.#closed || this.#started) return
    this.#started = true
    this.#reader = new DocumentDraftStore(this.#scope, () => { void this.refresh() })
    if (typeof window !== 'undefined') window.addEventListener('beforeunload', this.#leave)
    void this.refresh()
  }
  readonly #leave = (event: BeforeUnloadEvent) => { if (this.#state.pending || this.#state.failed || [...this.#writing.values()].some(value => value.record.composing)) event.preventDefault() }
  snapshot = (): CommentDraftState => this.#state
  subscribe = (listener: () => void): (() => void) => { this.#listeners.add(listener); return () => this.#listeners.delete(listener) }
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
          if (this.#isCommitted(value)) { await this.#reader!.mark([[markerOf(this.#scope, { id: value.id, revision: value.revision, token }), token]]); continue }
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
    const store = previous?.store ?? new DocumentDraftStore(this.#scope), commit = raw.length <= MAX_CHARS ? store.put(keyOf(this.#scope, record.id), raw) : undefined
    if (!commit) {
      // Keep the latest native bytes in this Workbench even when durable admission is refused.
      this.#writing.set(record.id, { record, raw, store, generation: 0, pending: false, failed: true, done: Promise.resolve('failed') })
      this.#pending(); void this.refresh()
      return record
    }
    const writing: Writing = { record, raw, store, generation: commit.generation, pending: true, failed: previous?.failed ?? false, done: commit.done }
    this.#writing.set(record.id, writing); this.#pending()
    void commit.done.then(result => {
      if (this.#closed || this.#writing.get(record.id) !== writing) return
      writing.pending = false
      writing.failed = result === 'failed'; this.#admissionFailure = false; this.#pending()
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
    if (!value || value.record.revision !== record.revision || record.owner !== this.#owner || this.#closed) return false
    const commit = value.store.remove(keyOf(this.#scope, record.id), [])
    if (!commit) return false
    value.pending = true; this.#pending()
    const result = await commit.done
    if (this.#closed || this.#writing.get(record.id) !== value) return false
    value.pending = false
    if (result === 'committed' && value.record.revision === record.revision) { this.#writing.delete(record.id); value.store.close() }
    else if (result === 'failed') this.#admissionFailure = true
    this.#pending(); void this.refresh()
    return result === 'committed'
  }
  async discard(reference: CommentDraftReference): Promise<boolean> {
    try {
    if (this.#closed || !this.#reader) return false
    const values = await this.#reader.read([prefix(this.#scope)]), writing = this.#writing.get(reference.id)
    const raw = writing && writing.record.revision === reference.revision && await tokenOf(writing.raw) === reference.token ? writing.raw : values.get(keyOf(this.#scope, reference.id))
    if (this.#closed || typeof raw !== 'string' || await tokenOf(raw) !== reference.token) return false
    const value: unknown = JSON.parse(raw)
    if (!valid(value, this.#scope) || value.revision !== reference.revision || this.#closed) return false
    const committed = await this.#reader!.mark([[markerOf(this.#scope, reference), reference.token]])
    if (!this.#closed) {
      if (committed && writing && this.#writing.get(reference.id) === writing && writing.record.revision === reference.revision && await tokenOf(writing.raw) === reference.token) { this.#writing.delete(reference.id); writing.store.close() }
      if (!committed) this.#admissionFailure = true
      this.#pending(); await this.refresh()
    }
    return committed
    } catch { this.#readFailure = true; this.#pending(); return false }
  }
  async recover(reference: CommentDraftReference, target: CommentComposerTarget, version: string): Promise<CommentDraftRecord | undefined> {
    try {
    if (this.#closed || !this.#reader) return
    const values = await this.#reader.read([prefix(this.#scope)]), writing = this.#writing.get(reference.id)
    const raw = writing && writing.record.revision === reference.revision && await tokenOf(writing.raw) === reference.token ? writing.raw : values.get(keyOf(this.#scope, reference.id))
    if (this.#closed || typeof raw !== 'string' || await tokenOf(raw) !== reference.token) return
    const value: unknown = JSON.parse(raw)
    if (!valid(value, this.#scope) || value.revision !== reference.revision || !sameCommentDraftTarget(value.target, target) || !this.#validContent(value) || this.#closed) return
    const record: CommentDraftRecord = { ...value, target: isNewCommentDraft(target) ? structuredClone(target) : value.target, id: crypto.randomUUID(), owner: this.#owner, revision: 1, updatedAt: Date.now(), version, composing: false, pending: undefined }
    const store = new DocumentDraftStore(this.#scope), next = JSON.stringify(record)
    if (next.length > MAX_CHARS || !await store.create(keyOf(this.#scope, record.id), next) || this.#closed) { store.close(); if (!this.#closed) { this.#admissionFailure = true; this.#pending() }; return }
    this.#writing.set(record.id, { record, raw: next, store, generation: 0, pending: false, failed: false, done: Promise.resolve('committed') })
    return record
    } catch { this.#readFailure = true; this.#pending(); return }
  }
  close(): void {
    if (this.#closed) return
    this.#closed = true; ++this.#read
    if (typeof window !== 'undefined') window.removeEventListener('beforeunload', this.#leave)
    this.#reader?.close()
    for (const value of this.#writing.values()) value.store.close()
    this.#listeners.clear()
  }
}

/** Workbench lifetime keeps unpublished session material when a document surface unmounts. */
export class CommentDraftBank {
  readonly #documents = new Map<string, CommentDrafts>()
  #closed = false
  get(identity: string, memberId: string): CommentDrafts | undefined {
    if (this.#closed) return
    const key = JSON.stringify([identity, memberId])
    let value = this.#documents.get(key)
    if (!value) { value = new CommentDrafts(identity, memberId); this.#documents.set(key, value) }
    return value
  }
  close(): void { this.#closed = true; for (const value of this.#documents.values()) value.close(); this.#documents.clear() }
}
