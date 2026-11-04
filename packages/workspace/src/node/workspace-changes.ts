import { CHANGES_MAX_REQUEST_CHARS, CHANGES_MAX_RESPONSE_CHARS, DOCUMENT_ENTRY, hasRole, jsonResponse, problemResponse } from '@lincyaw/kernel'
import type { ChangesCaller, WorkspaceChanges, WorkspaceChangesResult } from '@lincyaw/kernel'
import { validateChangesQuery, validateWorkspaceChangesRequest } from '@lincyaw/kernel/node'
import { listDocuments } from './config.ts'
import type { WorkspaceConfig } from './config.ts'
import { catchRequestErrors, RequestError } from './errors.ts'
import { documentsDiff } from './document-operations.ts'
import type { DocumentsChange } from './document-operations.ts'
import type { DocumentLocks } from './locks.ts'
import type { Revisions } from './revisions.ts'
import { MAX_SOURCE, validateDocumentSource } from './source-editor.ts'
import type { SourceEditor } from './source-editor.ts'
import { documentDirOf, isGeneratedPath } from './writer.ts'
import type { Route } from '@lincyaw/kernel'

const size = (value: unknown) => JSON.stringify(value).length
async function bounded<T>(work: () => Promise<T>): Promise<T> {
  try { return await work() }
  catch (error) {
    const value = error as { message?: string, status?: number }
    if (value.message?.startsWith('changes-') || value.message === 'authoring-review-required') throw error
    throw new RequestError(value.status ?? 409, value.message === 'document-invalid' ? 'changes-document-invalid' : 'changes-operation-failed')
  }
}
/** Web and MCP share the same capture, policy, document locks and frozen Revisions application. */
export function createWorkspaceChanges(options: { config: WorkspaceConfig, editor: SourceEditor, locks: DocumentLocks, revisions?: Revisions, changed(change: DocumentsChange): Promise<void> | void }) {
  const { config, editor, locks, revisions } = options
  const scope = (document: string | undefined, caller: ChangesCaller) => {
    if (!hasRole(caller.member, 'editor')) throw new RequestError(403, 'changes-permission-denied')
    if (caller.boundDocument !== undefined) {
      if (document !== undefined && document !== caller.boundDocument) throw new RequestError(403, 'changes-permission-denied')
      return { document: caller.boundDocument, home: false }
    }
    return editor.scope(document ?? '')
  }
  const writer = (caller: ChangesCaller) => {
    if (!hasRole(caller.member, 'editor') || caller.origin === 'agent' && (!hasRole(caller.member, 'owner') || caller.boundDocument !== undefined || caller.confirmed)) throw new RequestError(403, 'changes-permission-denied')
    if (caller.origin === 'agent' && config.settings['presmium.assistant']?.review === 'required') throw new RequestError(409, 'authoring-review-required')
  }
  const budget = (value: unknown) => { if (size(value) > CHANGES_MAX_REQUEST_CHARS) throw new RequestError(413, 'changes-request-too-large') }
  const service: WorkspaceChanges = {
    list: (query, caller) => bounded(async () => {
      budget(query)
      if (!validateChangesQuery(query)) throw new RequestError(400, 'changes-request-invalid')
      const owned = scope(query.document, caller)
      if (!revisions) return { available: false, files: [] }
      const state = await revisions.observeChanges(editor.roots(owned)), offset = query.offset ?? 0
      if (query.snapshot !== undefined && query.snapshot !== state.snapshot || offset > 0 && !query.snapshot) throw new RequestError(409, 'changes-state-changed')
      if (offset > state.files.length) throw new RequestError(400, 'changes-request-invalid')
      const raw = new Map(state.raw.map(file => [file.path, file]))
      const files = [] as import('@lincyaw/kernel').WorkspaceChangesAnswer['files']
      for (const file of state.files.slice(offset, offset + 20)) {
        if (!editor.canEdit(owned, file.path, caller.member)) throw new RequestError(403, 'changes-permission-denied')
        const row = { ...file, ...raw.get(file.path)?.mode === 'unsupported' ? { unsupported: true as const } : {} }
        if (size({ available: true, snapshot: state.snapshot, files: [...files, row], nextOffset: offset + files.length + 1 }) > CHANGES_MAX_RESPONSE_CHARS) break
        files.push(row)
      }
      if (!files.length && offset < state.files.length) throw new RequestError(413, 'changes-response-too-large')
      return { available: true, snapshot: state.snapshot, files, ...offset + files.length < state.files.length ? { nextOffset: offset + files.length } : {} }
    }),
    prepare: (request, caller) => bounded(async () => {
      budget(request); writer(caller)
      if (!validateWorkspaceChangesRequest(request) || request.action === 'commit' && !request.message.trim()) throw new RequestError(400, 'changes-request-invalid')
      const action = request.action, message = request.action === 'commit' ? request.message.trim() : undefined
      const owned = scope(request.document, caller)
      if (!revisions) throw new RequestError(409, 'changes-git-unavailable')
      const observed = await revisions.observeChanges(editor.roots(owned))
      if (request.snapshot !== undefined && request.snapshot !== observed.snapshot) throw new RequestError(409, 'changes-state-changed')
      const chosen = new Set(request.paths ?? observed.files.map(file => file.path))
      if (!chosen.size) throw new RequestError(409, 'changes-empty')
      const known = new Set(observed.files.map(file => file.path))
      if ([...chosen].some(path => !known.has(path))) throw new RequestError(409, 'changes-selection-changed')
      const paths = observed.files.filter(file => chosen.has(file.path)).map(file => file.path)
      let captured = { ...observed, files: observed.files.filter(file => chosen.has(file.path)), raw: observed.raw.filter(file => chosen.has(file.path)) }
      if (captured.raw.some(file => !file.change)) throw new RequestError(409, 'changes-file-unsupported')
      const owners = paths.map(path => documentDirOf(config, path))
      const check = () => {
        writer(caller)
        for (const [index, path] of paths.entries()) {
          if (!editor.canEdit(owned, path, caller.member) || isGeneratedPath(path)) throw new RequestError(403, 'changes-permission-denied')
          if (documentDirOf(config, path) !== owners[index]) throw new RequestError(409, 'changes-state-changed')
        }
      }
      check()
      if (action === 'commit') for (const file of captured.raw) {
        if (file.path === DOCUMENT_ENTRY || file.path.endsWith(`/${DOCUMENT_ENTRY}`)) {
          if (!file.change || !('content' in file.change)) throw new RequestError(409, 'changes-document-invalid')
          if (Buffer.byteLength(file.change.content) > MAX_SOURCE) throw new RequestError(413, 'changes-selection-too-large')
          let text: string
          try { text = new TextDecoder('utf-8', { fatal: true }).decode(file.change.content) } catch { throw new RequestError(422, 'changes-document-invalid') }
          validateDocumentSource(file.path, text)
        }
      }
      if (action === 'commit') captured = await revisions.freezeCommit(captured)
      let pending: Promise<WorkspaceChangesResult> | undefined
      return { paths: Object.freeze([...paths]), change: signal => pending ??= bounded(async () => {
        signal?.throwIfAborted(); check()
        const claim = locks.claimAll(owners.map(owner => owner ?? ''), `editor:${action}`)
        if ('holder' in claim) throw new RequestError(409, 'changes-workspace-busy')
        const before = listDocuments(config).map(document => document.dir)
        try {
          const revision = await revisions.applyChanges(action, captured, action === 'commit' ? { paths, summary: message!.split('\n')[0]!, body: message!.split('\n').slice(1).join('\n'), origin: { kind: caller.origin === 'agent' ? 'agent' : 'editor', member: caller.member } } : undefined, () => { signal?.throwIfAborted(); check() })
          let refreshed: false | undefined
          if (action === 'discard') {
            try { await options.changed(documentsDiff(before, listDocuments(config).map(document => document.dir))) } catch { refreshed = false }
          }
          return { ...refreshed === false ? { refreshed } : {}, action, files: paths.length, ...action === 'commit' ? { committed: Boolean(revision), ...revision ? { revision } : {} } : {} }
        } finally { claim.release() }
      }) }
    }),
  }
  const routes: Record<string, Route> = {
    changes: { role: 'editor', handle: (request, ctx) => catchRequestErrors(async () => {
      if (request.method !== 'GET') return problemResponse(405, 'GET')
      if (!revisions) return jsonResponse({ files: [] })
      const files = await revisions.uncommittedFiles(editor.roots(editor.scope(ctx.document)))
      return jsonResponse({ files })
    }) },
    ...Object.fromEntries((['commit', 'discard'] as const).map(action => [`changes/${action}`, { role: 'editor', handle: (request, ctx) => catchRequestErrors(async () => {
      if (request.method !== 'POST') return problemResponse(405, 'POST')
      const body: unknown = await request.json().catch(() => undefined)
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new RequestError(400, 'changes-request-invalid')
      const input = body as Record<string, unknown>
      const prepared = await service.prepare({ ...input, document: ctx.document, action, ...action === 'discard' ? { confirm: true } : {} } as import('@lincyaw/kernel').WorkspaceChangesRequest, { member: ctx.member, origin: 'editor' })
      const result = await prepared.change(request.signal)
      return jsonResponse({ paths: prepared.paths, ...result.refreshed === false ? { refreshed: false } : {}, ...result.revision ? { revision: result.revision } : {} })
    }) } satisfies Route])),
  }
  return { service, routes }
}
