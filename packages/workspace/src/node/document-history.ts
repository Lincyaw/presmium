import { createHash } from 'node:crypto'
import { DOCUMENT_ENTRY, DOCUMENT_HISTORY_MAX_FILE_BYTES, DOCUMENT_HISTORY_MAX_REQUEST_CHARS, DOCUMENT_HISTORY_MAX_RESPONSE_CHARS, DOCUMENT_HISTORY_PAGE_SIZE, fnv1a64, hasRole, jsonResponse, problemResponse } from '@lincyaw/kernel'
import type { DocumentHistory, DocumentHistoryAnswer, DocumentHistoryBinding, DocumentHistoryChange, DocumentHistoryChanged, DocumentHistoryFile, DocumentHistorySource, HistoryRevision, Member, Route } from '@lincyaw/kernel'
import { validateDocumentHistoryChange, validateDocumentHistoryQuery, validateDocumentHistoryRead } from '@lincyaw/kernel/node'
import { listDocuments } from './config.ts'
import type { WorkspaceConfig } from './config.ts'
import { catchRequestErrors, RequestError } from './errors.ts'
import { lockedError } from './locks.ts'
import type { DocumentLocks } from './locks.ts'
import type { Revisions } from './revisions.ts'
import type { SourceEditor } from './source-editor.ts'
import { documentDirOf } from './writer.ts'

const MAX_RECEIPTS = 64
const entryOf = (document: string) => document ? `${document}/${DOCUMENT_ENTRY}` : DOCUMENT_ENTRY
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const digest = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex')
const sameBinding = (a: DocumentHistoryBinding, b: DocumentHistoryBinding) => a.snapshot === b.snapshot && a.source.version === b.source.version && a.source.fingerprint === b.source.fingerprint
const size = (value: unknown) => JSON.stringify(value, null, 2).length
const requestSize = (value: unknown) => { if (JSON.stringify(value).length > DOCUMENT_HISTORY_MAX_REQUEST_CHARS) throw new RequestError(413, 'history-request-too-large') }

export interface DocumentHistoryOptions {
  config: WorkspaceConfig
  editor: SourceEditor
  locks: DocumentLocks
  revisions?: Revisions
  reviewRequired?: boolean
  changed(before: string[], after: string[]): Promise<void> | void
  reverted?(target: string, revision: string): Promise<void> | void
}

/** The one scoped history application boundary, borrowing the existing git transaction owner. */
export function createDocumentHistory(options: DocumentHistoryOptions): { service: DocumentHistory, routes: Record<string, Route>, close(): Promise<void> } {
  const { config, editor, locks, revisions } = options
  let closed = false
  const open = () => { if (closed) throw new RequestError(503, 'history-owner-closed') }
  const receipts = new Map<string, { signature: string, answer: DocumentHistoryChanged }>()
  const pending = new Map<string, { signature: string, work: Promise<DocumentHistoryChanged> }>()
  const scope = (document: string, member: Member) => {
    if (!hasRole(member, 'editor')) throw new RequestError(403, 'history-permission-denied')
    if (!listDocuments(config).some(item => item.dir === document)) throw new RequestError(404, 'history-document-not-found')
    return { document, home: false }
  }
  const source = (document: string, member: Member): DocumentHistorySource => {
    const raw = editor.read(scope(document, member), entryOf(document), member)
    return { version: raw.version, fingerprint: fnv1a64(raw.content) }
  }
  const binding = async (document: string, member: Member): Promise<DocumentHistoryBinding> => { const snapshot = await history().head(); if (!snapshot) throw new RequestError(409, 'history-empty-repository'); return { source: source(document, member), snapshot } }
  const history = () => { if (!revisions) throw new RequestError(409, 'history-git-unavailable'); return revisions }
  const pathAllowed = (document: string, path: string, member: Member) => {
    const owned = scope(document, member)
    editor.assertEditable(owned, path, member)
    if ((/[\x00-\x1f\x7f]/.test(path) || path.split('/').some(part => part.startsWith('.'))) || documentDirOf(config, path) !== document) throw new RequestError(403, 'history-file-outside-document')
  }
  const compact = (document: string, entry: HistoryRevision, member: Member): HistoryRevision => {
    const files = entry.files.filter(path => { try { pathAllowed(document, path, member); return path.length <= 500 } catch { return false } })
    const message = (entry.message.split('\n')[0] ?? '').slice(0, 240)
    return { id: entry.id, message, author: entry.author.slice(0, 120), date: entry.date, origin: { kind: entry.origin.kind }, files: files.slice(0, 6),
      ...entry.revertedBy ? { revertedBy: entry.revertedBy } : {}, ...entry.reverts ? { reverts: entry.reverts } : {}, ...entry.redo ? { redo: true } : {},
      ...entry.operation ? { operation: entry.operation } : {}, ...entry.revertible === false ? { revertible: false } : {}, ...entry.undone !== undefined ? { undone: entry.undone, revertTarget: entry.revertTarget } : {} }
  }
  const service: DocumentHistory = {
    async list(document, query, member) {
      open()
      requestSize(query)
      if (!validateDocumentHistoryQuery(query)) throw new RequestError(400, 'history-query-invalid')
      scope(document, member)
      if (!revisions) return { document, available: false, revisions: [] }
      if (!await revisions.head()) { if (query.snapshot !== undefined || (query.offset ?? 0) > 0) throw new RequestError(409, 'history-snapshot-changed'); return { document, available: true, unborn: true, revisions: [] } }
      const before = await binding(document, member)
      if ((query.offset ?? 0) > 0 && !query.snapshot) throw new RequestError(400, 'history-snapshot-required')
      if (query.snapshot !== undefined && query.snapshot !== before.snapshot) throw new RequestError(409, 'history-snapshot-changed')
      const full = await revisions.historyWithUndo({ document }), changes = full.revisions.filter(entry => !entry.reverts), offset = query.offset ?? 0
      if (offset > changes.length) throw new RequestError(400, 'history-offset-invalid')
      const answer: DocumentHistoryAnswer = { document, available: true, historyBinding: before, revisions: [], ...full.undo ? { undo: full.undo } : {}, ...full.redo ? { redo: full.redo } : {} }
      let index = offset
      for (const entry of changes.slice(offset, offset + DOCUMENT_HISTORY_PAGE_SIZE)) {
        const row = compact(document, entry, member)
        const candidate = { ...answer, revisions: [...answer.revisions, row], nextOffset: index + 1, truncated: true }
        if (size(candidate) > DOCUMENT_HISTORY_MAX_RESPONSE_CHARS) break
        answer.revisions.push(row); index++
        if (!same(row, entry)) answer.truncated = true
      }
      if (index < changes.length) { if (index === offset) throw new RequestError(413, 'history-entry-too-large'); answer.nextOffset = index }
      if (!sameBinding(before, await binding(document, member))) throw new RequestError(409, 'history-snapshot-changed')
      return answer
    },
    async read(document, query, member) {
      open()
      requestSize(query)
      if (!validateDocumentHistoryRead(query)) throw new RequestError(400, 'history-read-invalid')
      const path = query.path ?? entryOf(document)
      pathAllowed(document, path, member)
      const bytes = await history().readFile(query.revision, path, DOCUMENT_HISTORY_MAX_FILE_BYTES, document)
      let content: string
      try { content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes) } catch { throw new RequestError(422, 'history-file-not-utf8') }
      if (content.includes('\0')) throw new RequestError(422, 'history-file-not-utf8-text')
      const offset = query.offset ?? 0
      if (offset > content.length || offset > 0 && /[\uD800-\uDBFF]/.test(content[offset - 1]!) && /[\uDC00-\uDFFF]/.test(content[offset] ?? '')) throw new RequestError(400, 'history-offset-invalid')
      const reply = (end: number): DocumentHistoryFile => ({ document, revision: query.revision, path, encoding: 'utf8-text-fragment', text: content.slice(offset, end), offset, ...end < content.length ? { nextOffset: end } : {}, totalChars: content.length, complete: end === content.length, sha256: digest(bytes), verification: 'historical-file-only' })
      let low = offset, high = Math.min(content.length, offset + DOCUMENT_HISTORY_MAX_RESPONSE_CHARS)
      while (low < high) { const middle = Math.ceil((low + high) / 2); if (size(reply(middle)) <= DOCUMENT_HISTORY_MAX_RESPONSE_CHARS) low = middle; else high = middle - 1 }
      if (low < content.length && low > offset && /[\uD800-\uDBFF]/.test(content[low - 1]!) && /[\uDC00-\uDFFF]/.test(content[low]!)) low--
      if (low === offset && offset < content.length) throw new RequestError(413, 'history-file-reply-too-large')
      return reply(low)
    },
    async change(document, which, request, member, origin = 'editor') {
      open()
      requestSize(request)
      if (!validateDocumentHistoryChange(request)) throw new RequestError(400, 'history-change-invalid')
      scope(document, member)
      if (origin === 'agent' && options.reviewRequired) throw new RequestError(409, 'authoring-review-required')
      const key = JSON.stringify([document, member.id, request.id]), signature = digest(JSON.stringify([which, request.id, request.snapshot, request.source.version, request.source.fingerprint, request.expect]))
      const known = receipts.get(key), flight = pending.get(key)
      if (known || flight) {
        if ((known ?? flight)!.signature !== signature) throw new RequestError(409, 'history-intent-reused')
        if (flight) return flight.work
        if (!sameBinding(await binding(document, member), { source: known!.answer.source, snapshot: known!.answer.snapshot })) throw new RequestError(409, 'history-result-no-longer-current')
        return structuredClone(known!.answer)
      }
      if (pending.size >= MAX_RECEIPTS) throw new RequestError(429, 'history-busy')
      const work = Promise.resolve().then(async () => {
        const paths = await history().filesOf(request.expect)
        if (!paths.length) throw new RequestError(404, 'history-revision-not-found')
        for (const path of paths) {
          pathAllowed(document, path, member)
          const owners = await Promise.all([history().ownerAt(request.expect, path), history().ownerAt(`${request.expect}^1`, path)])
          if (!owners.includes(document) || owners.some(owner => owner !== undefined && owner !== document)) throw new RequestError(403, 'history-file-outside-document')
        }
        const claimed = locks.claimAll(paths.map(path => documentDirOf(config, path)!), 'revision:revert')
        if ('holder' in claimed) throw lockedError(claimed.document, claimed.holder)
        try {
          const beforeDocuments = listDocuments(config).map(item => item.dir)
          const result = await history().revert(request.expect, member, which === 'revert' ? undefined : { which, document }, async changed => {
            for (const path of changed) pathAllowed(document, path, member)
            if (!sameBinding(await binding(document, member), { source: request.source, snapshot: request.snapshot })) throw new RequestError(409, 'history-source-changed')
          }, origin)
          if (!result.ok) throw new RequestError(409, 'history-conflict', { conflicts: result.conflicts.slice(0, 6).map(path => path.slice(0, 500)), conflictCount: result.conflicts.length })
          const answer: DocumentHistoryChanged = { document, ok: true, revision: { id: result.revision.id, origin: { kind: result.revision.origin.kind } }, ...await binding(document, member), verification: { saved: true, compiled: 'not-requested', runtime: 'not-requested' } }
          receipts.set(key, { signature, answer }); while (receipts.size > MAX_RECEIPTS) receipts.delete(receipts.keys().next().value!)
          await options.changed(beforeDocuments, listDocuments(config).map(item => item.dir))
          void Promise.resolve(options.reverted?.(request.expect, result.revision.id)).catch(() => undefined)
          return structuredClone(answer)
        } finally { claimed.release() }
      })
      pending.set(key, { signature, work })
      try { return await work } finally { if (pending.get(key)?.work === work) pending.delete(key) }
    },
  }
  const readRoute = (read: 'list' | 'read'): Route => ({ role: 'editor', handle: (request, ctx) => catchRequestErrors(async () => {
    if (request.method !== 'GET') return problemResponse(405, 'GET')
    let query: unknown
    try { query = JSON.parse(new URL(request.url).searchParams.get('query') ?? '{}') } catch { throw new RequestError(400, 'history-query-invalid') }
    if (read === 'list') { if (!validateDocumentHistoryQuery(query)) throw new RequestError(400, 'history-query-invalid'); return jsonResponse(await service.list(ctx.document, query, ctx.member)) }
    if (!validateDocumentHistoryRead(query)) throw new RequestError(400, 'history-read-invalid')
    return jsonResponse(await service.read(ctx.document, query, ctx.member))
  }) })
  const changeRoute = (which: 'undo' | 'redo' | 'revert'): Route => ({ role: 'editor', maxBody: 8192, handle: (request, ctx) => catchRequestErrors(async () => {
    if (request.method !== 'POST') return problemResponse(405, 'POST')
    const body: unknown = await request.json().catch(() => undefined)
    if (!validateDocumentHistoryChange(body)) throw new RequestError(400, 'history-change-invalid')
    return jsonResponse(await service.change(ctx.document, which, body, ctx.member))
  }) })
  return { service, async close() { closed = true; await Promise.allSettled([...pending.values()].map(item => item.work)); receipts.clear() }, routes: { 'revisions': readRoute('list'), 'history/list': readRoute('list'), 'history/file': readRoute('read'), 'history/undo': changeRoute('undo'), 'history/redo': changeRoute('redo'), 'revisions/revert': changeRoute('revert') } }
}
