import { createHash } from 'node:crypto'
import { DOCUMENT_ENTRY, hasRole, SOURCE_FRAGMENT_CHARS, SOURCE_MAX_REQUEST_CHARS, SOURCE_MAX_RESPONSE_CHARS } from '@lincyaw/kernel'
import type { SourceCaller, SourceSaved, WorkspaceSource } from '@lincyaw/kernel'
import { validateSourceEdit, validateSourceList, validateSourceRead } from '@lincyaw/kernel/node'
import { listDocumentEntries } from './config.ts'
import type { WorkspaceConfig } from './config.ts'
import { RequestError } from './errors.ts'
import { saveSummary } from '../domain/commit-message.ts'
import type { Revisions } from './revisions.ts'
import { validateDocumentSource } from './source-editor.ts'
import type { SourceEditor } from './source-editor.ts'

const size = (value: unknown) => JSON.stringify(value).length
const fits = (value: unknown) => size(value) <= SOURCE_MAX_RESPONSE_CHARS
const digest = (value: string) => createHash('sha256').update(value).digest('hex')
const canonical = (path: string) => path === DOCUMENT_ENTRY || path.endsWith(`/${DOCUMENT_ENTRY}`)
/** SourceEditor keeps detailed conflicts for Web; MCP never returns full conflicting file contents. */
async function bounded<T>(work: () => Promise<T>): Promise<T> {
  try { return await work() }
  catch (error) {
    const value = error as { message?: string, status?: number, code?: string, detail?: { conflict?: { version?: string }, exists?: boolean, issues?: { path?: string, code?: string, message?: string, severity?: string }[] } }
    if (error instanceof Error && error.name === 'AbortError') throw error
    if (value.message?.startsWith('source-') || value.message === 'authoring-review-required') throw error
    if (value.message === 'document-invalid') {
      const issues = value.detail?.issues?.slice(0, 4).map(issue => ({ path: issue.path?.slice(0, 500) ?? '', code: issue.code?.slice(0, 100) ?? 'document-invalid', message: issue.message?.slice(0, 240) ?? '', severity: issue.severity === 'warning' ? 'warning' : 'error' })) ?? []
      while (size({ issues }) > SOURCE_MAX_RESPONSE_CHARS - 1024 && issues.length) issues.pop()
      throw new RequestError(422, 'document-invalid', { issues })
    }
    if (value.message === 'document-identity-changed') throw new RequestError(422, 'document-identity-changed')
    if (value.status === 409) throw new RequestError(409, value.detail?.exists ? 'source-file-exists' : 'source-version-changed', value.detail?.conflict?.version ? { version: value.detail.conflict.version } : undefined)
    const status = value.status ?? ({ ENOENT: 404, EEXIST: 409, ELOOP: 403, EACCES: 403, EISDIR: 415 } as Record<string, number>)[value.code ?? ''] ?? 500
    throw new RequestError(status, status === 404 ? 'source-file-not-found' : status === 409 ? 'source-file-exists' : status === 403 ? 'source-file-forbidden' : status === 413 ? 'source-file-too-large' : status === 415 ? 'source-text-required' : status < 500 ? 'source-request-invalid' : 'source-operation-failed')
  }
}

/** A bounded adapter over the native source scope, preflight, transaction and history owner. */
export function createWorkspaceSource(options: { config: WorkspaceConfig, editor: SourceEditor, revisions?: Revisions }): WorkspaceSource {
  const { config, editor, revisions } = options
  const scope = (document: string | undefined, caller: SourceCaller) => {
    if (!hasRole(caller.member, 'editor')) throw new RequestError(403, 'source-file-forbidden')
    if (caller.boundDocument !== undefined) {
      if (document !== undefined && document !== caller.boundDocument) throw new RequestError(403, 'source-file-forbidden')
      return { document: caller.boundDocument, home: false }
    }
    if (document && !listDocumentEntries(config).some(entry => entry.dir === document)) throw new RequestError(404, 'source-file-not-found')
    return editor.scope(document ?? '')
  }
  const request = (value: unknown) => { if (size(value) > SOURCE_MAX_REQUEST_CHARS) throw new RequestError(413, 'source-request-too-large') }
  const writer = (caller: SourceCaller) => {
    if (!hasRole(caller.member, 'owner') || caller.boundDocument !== undefined || caller.confirmed) throw new RequestError(403, 'source-file-forbidden')
    if (caller.origin === 'agent' && config.settings['presmium.assistant']?.review === 'required') throw new RequestError(409, 'authoring-review-required')
  }
  const repair = (path: string, before: Uint8Array | undefined) => {
    if (!canonical(path)) return
    if (!before || !listDocumentEntries(config).some(entry => entry.entry === path)) throw new RequestError(409, 'source-canonical-edit-required')
    try { validateDocumentSource(path, Buffer.from(before).toString('utf8')) }
    catch (error) { if ((error as Error).message === 'document-invalid') return; throw error }
    throw new RequestError(409, 'source-canonical-edit-required')
  }
  return {
    list: (query, caller) => bounded(async () => {
      request(query)
      if (!validateSourceList(query)) throw new RequestError(400, 'source-request-invalid')
      const owned = scope(query.document, caller), listed = editor.files(owned, caller.member)
      const files = listed.files.filter(file => !query.query || file.path.toLowerCase().includes(query.query.toLowerCase()))
      const snapshot = digest(JSON.stringify([owned, query.query ?? '', files, listed.truncated ?? false])), offset = query.offset ?? 0
      if (offset > 0 && !query.snapshot || query.snapshot !== undefined && query.snapshot !== snapshot) throw new RequestError(409, 'source-list-changed')
      if (offset > files.length) throw new RequestError(400, 'source-request-invalid')
      const answer = { files: [] as typeof files, snapshot, ...listed.truncated ? { truncated: true as const } : {} }
      for (const file of files.slice(offset, offset + 20)) {
        if (!fits({ ...answer, files: [...answer.files, file], nextOffset: offset + answer.files.length + 1 })) break
        answer.files.push(file)
      }
      if (!answer.files.length && offset < files.length) throw new RequestError(413, 'source-response-too-large')
      return { ...answer, ...offset + answer.files.length < files.length ? { nextOffset: offset + answer.files.length } : {} }
    }),
    read: (query, caller) => bounded(async () => {
      request(query)
      if (!validateSourceRead(query)) throw new RequestError(400, 'source-request-invalid')
      const value = editor.read(scope(query.document, caller), query.path, caller.member), offset = query.offset ?? 0
      if (offset > 0 && !query.version || query.version !== undefined && query.version !== value.version) throw new RequestError(409, 'source-version-changed')
      if (offset > value.content.length) throw new RequestError(400, 'source-request-invalid')
      const answer = { path: value.path, version: value.version, text: value.content.slice(offset, offset + SOURCE_FRAGMENT_CHARS), offset, totalChars: value.content.length, nextOffset: 0 }
      const cursor = () => answer.nextOffset = offset + answer.text.length
      cursor()
      while (!fits(answer) && answer.text.length) { answer.text = answer.text.slice(0, Math.floor(answer.text.length / 2)); cursor() }
      if (!fits(answer) || !answer.text.length && offset < value.content.length) throw new RequestError(413, 'source-response-too-large')
      const { nextOffset, ...part } = answer
      return { ...part, ...nextOffset < value.content.length ? { nextOffset } : {} }
    }),
    prepare: (edit, caller) => bounded(async () => {
      request(edit); writer(caller)
      if (!validateSourceEdit(edit)) throw new RequestError(400, 'source-request-invalid')
      const document = edit.document, owned = scope(document, caller), edits = 'edits' in edit ? edit.edits : [edit]
      const captured = edits.map(file => {
        const creating = 'create' in file && file.create === true
        if (creating && (canonical(file.path) || file.version !== undefined)) throw new RequestError(409, 'source-canonical-edit-required')
        const before = creating ? undefined : editor.read(owned, file.path, caller.member)
        if (file.version !== undefined && before?.version !== file.version) throw new RequestError(409, 'source-version-changed')
        repair(file.path, before && Buffer.from(before.content))
        let content: string
        if ('content' in file) content = file.content
        else {
          const first = before!.content.indexOf(file.find)
          if (first < 0 || before!.content.indexOf(file.find, first + 1) >= 0) throw new RequestError(409, 'source-find-not-unique')
          content = before!.content.slice(0, first) + file.replace + before!.content.slice(first + file.find.length)
        }
        return { path: file.path, content, base: before?.version ?? null, changed: creating || before!.content !== content }
      })
      const changes = captured.map(({ changed: _changed, ...file }) => file)
      await editor.planTransaction(owned, changes, caller.member)
      let work: Promise<SourceSaved> | undefined
      return { change: (signal?: AbortSignal) => work ??= bounded(async () => {
        const result = await editor.transaction(owned, changes, caller.member, {
          check: files => {
            signal?.throwIfAborted(); writer(caller)
            if (JSON.stringify(scope(document, caller)) !== JSON.stringify(owned)) throw new RequestError(409, 'source-scope-changed')
            for (const file of files) repair(file.path, file.before)
          },
          run: task => revisions ? revisions.transaction(task) : task(),
          commit: async (paths, lang) => {
            if (!revisions) return
            if ((await Promise.all(paths.map(path => revisions.ignores(path)))).some(Boolean)) throw new RequestError(409, 'source-ignored-file')
            return revisions.commitWhileLocked({ paths, summary: saveSummary(paths[0]!, lang), body: '', origin: { kind: caller.origin === 'agent' ? 'agent' : 'editor', member: caller.member } })
          },
        })
        let current = false
        try { current = result.versions.every(value => editor.read(owned, value.path, caller.member).version === value.version) } catch { /* A successful write is not safely retryable when readback changes or fails. */ }
        return { saved: true as const, changed: captured.some(file => file.changed), ...captured.length === 1 ? { path: captured[0]!.path } : { files: captured.length }, ...result.revision ? { revision: result.revision.id } : {}, ...!current ? { current: false as const } : {} }
      }) }
    }),
  }
}
