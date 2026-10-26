import { DOCUMENT_ENTRY, isRecord, jsonResponse, pushStream, sseResponse, validateDocument } from '@lincyaw/kernel'
import { createHash } from 'node:crypto'
import { watch } from 'node:fs'
import { join } from 'node:path'
import type { DocumentAnswer, DocumentChange, DocumentChangeAnswer, DocumentEvent, DocumentIssue, RequestContext, Route, TeachingDocument } from '@lincyaw/kernel'
import { applyDocumentOperations } from '@lincyaw/kernel'
import { catchRequestErrors, RequestError } from './errors.ts'
import type { SourceEditor, SourceTransactionHistory } from './source-editor.ts'
import type { Revisions } from './revisions.ts'

interface Options { root: string, editor: SourceEditor, revisions?: Revisions }

const entryOf = (directory: string): string => directory ? `${directory}/${DOCUMENT_ENTRY}` : DOCUMENT_ENTRY

function decode(content: string): { document?: TeachingDocument, issues: DocumentIssue[] } {
  let value: unknown
  try { value = JSON.parse(content.replace(/^\uFEFF/, '')) }
  catch { return { issues: [{ path: '', code: 'json-syntax', message: 'The document is not valid JSON.', severity: 'error' }] } }
  return validateDocument(value)
}

/** A document save validates author intent and never waits for a compiled preview. */
export function documentEditorRoutes({ root, editor, revisions }: Options): Record<string, Route> {
  const opened = (ctx: RequestContext) => {
    const source = editor.read(editor.scope(ctx.document), entryOf(ctx.document), ctx.member)
    const checked = decode(source.content)
    if (!checked.document || checked.issues.some(issue => issue.severity === 'error')) throw new RequestError(422, 'document-invalid', { issues: checked.issues })
    return { source, content: checked.document, issues: checked.issues }
  }
  const receipts = new Map<string, { signature: string, version: string, files: DocumentChangeAnswer['files'], commit?: DocumentChangeAnswer['commit'] }>()
  return {
    document: {
      role: 'editor',
      handle: (request, ctx) => catchRequestErrors(async () => {
        if (request.method !== 'GET') throw new RequestError(405, 'GET')
        const { source, content, issues } = opened(ctx)
        return jsonResponse({ document: ctx.document, version: source.version, content, issues } satisfies DocumentAnswer)
      }),
    },
    'document/events': {
      role: 'editor',
      handle: (request, ctx) => catchRequestErrors(async () => {
        if (request.method !== 'GET') throw new RequestError(405, 'GET')
        // Check the same document permission before observing its directory.
        editor.read(editor.scope(ctx.document), entryOf(ctx.document), ctx.member)
        const stream = pushStream<{ event: string, data: DocumentEvent }>(push => {
          let timer: ReturnType<typeof setTimeout> | undefined, last: string | undefined
          const emit = () => {
            let event: DocumentEvent
            try {
              const source = editor.read(editor.scope(ctx.document), entryOf(ctx.document), ctx.member), checked = decode(source.content)
              event = { document: ctx.document, version: source.version, valid: Boolean(checked.document) && !checked.issues.some(issue => issue.severity === 'error'), issues: checked.issues }
            } catch {
              event = { document: ctx.document, version: '', valid: false, issues: [{ path: '', code: 'document-unavailable', message: 'The document is unavailable.', severity: 'error' }] }
            }
            const signature = JSON.stringify(event)
            if (signature !== last) { last = signature; push({ event: 'document', data: event }) }
          }
          const watcher = watch(join(root, ctx.document), { persistent: false }, (_, name) => {
            if (name !== null && String(name) !== DOCUMENT_ENTRY) return
            clearTimeout(timer)
            timer = setTimeout(emit, 30)
          })
          watcher.on('error', emit)
          emit()
          return () => { clearTimeout(timer); watcher.close() }
        }, { signal: request.signal, latestOnly: true })
        return sseResponse(stream, request.signal)
      }),
    },
    'document/change': {
      role: 'editor', maxBody: 6 << 20,
      handle: (request, ctx) => catchRequestErrors(async () => {
        if (request.method !== 'POST') throw new RequestError(405, 'POST')
        const raw: unknown = await request.json().catch(() => undefined)
        if (!isRecord(raw) || typeof raw.id !== 'string' || !raw.id || raw.id.length > 200 || typeof raw.baseDocumentVersion !== 'string'
          || (raw.replacement === undefined) === (raw.operations === undefined)
          || raw.operations !== undefined && (!Array.isArray(raw.operations) || !raw.operations.length)
          || raw.fileChanges !== undefined && !Array.isArray(raw.fileChanges)) throw new RequestError(400, '{ id, baseDocumentVersion, replacement | operations, fileChanges? }')
        const change = raw as unknown as DocumentChange
        const current = opened(ctx), signature = createHash('sha256').update(JSON.stringify(change)).digest('hex'), key = JSON.stringify([ctx.document, ctx.member.id, change.id])
        const receipt = receipts.get(key)
        if (receipt) {
          if (receipt.signature !== signature) throw new RequestError(409, 'document-change-id-reused')
          if (receipt.version !== current.source.version) throw new RequestError(409, 'document-version-changed', { version: current.source.version })
          if (receipt.files.some(file => editor.read(editor.scope(ctx.document), file.path, ctx.member).version !== file.version)) throw new RequestError(409, 'document-files-changed')
          return jsonResponse({ changeId: change.id, document: ctx.document, version: current.source.version, content: current.content, issues: current.issues, files: receipt.files, ...receipt.commit ? { commit: receipt.commit } : {} } satisfies DocumentChangeAnswer)
        }
        if (current.source.version !== change.baseDocumentVersion) throw new RequestError(409, 'document-version-changed', { version: current.source.version })
        let candidate: unknown = change.replacement
        if (change.operations) {
          try { candidate = applyDocumentOperations(current.content, change.operations) }
          catch { throw new RequestError(422, 'document-operation-invalid') }
        }
        const checked = validateDocument(candidate)
        if (!checked.document || checked.issues.some(issue => issue.severity === 'error')) throw new RequestError(422, 'document-invalid', { issues: checked.issues })
        if (checked.document.id !== current.content.id) throw new RequestError(422, 'document-identity-changed')
        const fileChanges = change.fileChanges ?? []
        if (!fileChanges.every(file => isRecord(file) && typeof file.path === 'string' && typeof file.content === 'string' && (file.base === null || typeof file.base === 'string'))) throw new RequestError(400, 'document-files-invalid')
        if (fileChanges.some(file => file.path === current.source.path)) throw new RequestError(422, 'document-file-repeated')
        const content = `${JSON.stringify(checked.document, null, 2)}\n`
        const history: SourceTransactionHistory | undefined = revisions ? {
          run: work => revisions.transaction(work),
          commit: async paths => {
            const ignored = (await Promise.all(paths.map(async path => await revisions.ignores(path) ? path : undefined))).filter((path): path is string => Boolean(path))
            if (ignored.length) throw new RequestError(409, 'document-files-ignored', { ignored })
            return revisions.commitWhileLocked({ paths, summary: checked.document!.metadata.lang?.startsWith('en') ? 'Edit document' : '编辑文稿', body: '', origin: { kind: 'editor', member: ctx.member } })
          },
        } : undefined
        const saved = await editor.transaction(editor.scope(ctx.document), [{ path: current.source.path, content, base: current.source.version }, ...fileChanges], ctx.member, history)
        const version = saved.versions.find(file => file.path === current.source.path)!.version
        const answer: DocumentChangeAnswer = { changeId: change.id, document: ctx.document, version, content: checked.document, issues: checked.issues, files: saved.versions, ...saved.revision ? { commit: saved.revision } : {} }
        receipts.set(key, { signature, version, files: saved.versions, ...saved.revision ? { commit: saved.revision } : {} })
        while (receipts.size > 64) receipts.delete(receipts.keys().next().value!)
        return jsonResponse(answer)
      }),
    },
  }
}
