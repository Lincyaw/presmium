import { DOCUMENT_ENTRY, DOCUMENT_READ_MAX_REQUEST_CHARS, jsonResponse, pushStream, sseResponse } from '@lincyaw/kernel'
import { randomUUID } from 'node:crypto'
import { watch } from 'node:fs'
import { join } from 'node:path'
import type { DocumentChange, DocumentEvent, DocumentOutlineQuery, DocumentPartQuery, DocumentPageChangeRequest, DocumentPageChangeReference, RequestContext, Route } from '@lincyaw/kernel'
import { catchRequestErrors, RequestError } from './errors.ts'
import type { SourceEditor } from './source-editor.ts'
import type { WorkbenchApi } from './workbench-api.ts'
import { documentAssetResponse } from './document-assets.ts'
import { decodeAuthoringDocument as decode, readAuthoringDocument } from './document-authoring.ts'
import type { DocumentEditor } from './document-authoring.ts'

export { createDocumentEditor, readAuthoringDocument } from './document-authoring.ts'
export type { DocumentEditor } from './document-authoring.ts'

interface Options { root: string, editor: SourceEditor, documentEditor: DocumentEditor, workbench?: WorkbenchApi }
const entryOf = (directory: string): string => directory ? `${directory}/${DOCUMENT_ENTRY}` : DOCUMENT_ENTRY

/** A document save validates author intent and never waits for a compiled preview. */
export function documentEditorRoutes({ root, editor, documentEditor, workbench }: Options): Record<string, Route> {
  const opened = (ctx: RequestContext) => readAuthoringDocument(editor, ctx)
  const queryOf = (request: Request): unknown => {
    const query = new URL(request.url).searchParams.get('query') ?? '{}'
    if (query.length > DOCUMENT_READ_MAX_REQUEST_CHARS) throw new RequestError(413, 'document-read-request-too-large')
    try { return JSON.parse(query) } catch { throw new RequestError(400, 'document-read-query-invalid') }
  }
  return {
    document: {
      role: 'editor',
      handle: (request, ctx) => catchRequestErrors(async () => {
        if (request.method !== 'GET') throw new RequestError(405, 'GET')
        return jsonResponse(await documentEditor.read(ctx.document, ctx.member))
      }),
    },
    'document/outline': {
      role: 'editor',
      handle: (request, ctx) => catchRequestErrors(async () => {
        if (request.method !== 'GET') throw new RequestError(405, 'GET')
        return jsonResponse(await documentEditor.outline(ctx.document, queryOf(request) as DocumentOutlineQuery, ctx.member))
      }),
    },
    'document/part': {
      role: 'editor',
      handle: (request, ctx) => catchRequestErrors(async () => {
        if (request.method !== 'GET') throw new RequestError(405, 'GET')
        return jsonResponse(await documentEditor.readPart(ctx.document, queryOf(request) as DocumentPartQuery, ctx.member))
      }),
    },
    'document/asset': {
      role: 'editor',
      handle: (request, ctx) => catchRequestErrors(async () => {
        if (request.method !== 'GET') throw new RequestError(405, 'GET')
        const { content } = opened(ctx)
        const id = new URL(request.url).searchParams.get('asset')
        if (!id) throw new RequestError(400, 'document-asset-id-required')
        return documentAssetResponse(root, ctx.document, content, id, path => editor.readableFile(editor.scope(ctx.document), path, ctx.member), request.signal)
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
          const observation = randomUUID()
          let project = 0
          const emit = () => {
            let event: DocumentEvent
            try {
              const source = editor.read(editor.scope(ctx.document), entryOf(ctx.document), ctx.member), checked = decode(source.content)
              event = { document: ctx.document, version: source.version, valid: Boolean(checked.document) && !checked.issues.some(issue => issue.severity === 'error'), issues: checked.issues }
            } catch {
              event = { document: ctx.document, version: '', valid: false, issues: [{ path: '', code: 'document-unavailable', message: 'The document is unavailable.', severity: 'error' }] }
            }
            event.projectRevision = `${observation}:${project}`
            const signature = JSON.stringify(event)
            if (signature !== last) { last = signature; push({ event: 'document', data: event }) }
          }
          const watcher = watch(join(root, ctx.document), { persistent: false }, (_, name) => {
            if (name !== null && String(name) !== DOCUMENT_ENTRY) return
            clearTimeout(timer)
            timer = setTimeout(emit, 30)
          })
          watcher.on('error', emit)
          const stopProject = workbench?.onCompiled(ctx.document, event => {
            if (!event.files.some(file => file !== entryOf(ctx.document))) return
            project++; clearTimeout(timer); timer = setTimeout(emit, 30)
          })
          emit()
          return () => { clearTimeout(timer); watcher.close(); stopProject?.() }
        }, { signal: request.signal, latestOnly: true })
        return sseResponse(stream, request.signal)
      }),
    },
    'document/page/plan': {
      role: 'editor', maxBody: 16 << 10,
      handle: (request, ctx) => catchRequestErrors(async () => {
        if (request.method === 'GET') {
          const query = new URL(request.url).searchParams
          return jsonResponse(await documentEditor.readPageChangePlan(ctx.document, { planId: query.get('planId') ?? '', digest: query.get('digest') ?? '' }, ctx.member))
        }
        if (request.method !== 'POST') throw new RequestError(405, 'POST or GET')
        return jsonResponse(await documentEditor.planPageChange(ctx.document, await request.json().catch(() => undefined) as DocumentPageChangeRequest, ctx.member))
      }),
    },
    'document/page/apply': {
      role: 'editor', maxBody: 16 << 10,
      handle: (request, ctx) => catchRequestErrors(async () => {
        if (request.method !== 'POST') throw new RequestError(405, 'POST')
        return jsonResponse(await documentEditor.applyPageChange(ctx.document, await request.json().catch(() => undefined) as DocumentPageChangeReference, ctx.member))
      }),
    },
    'document/change': {
      role: 'editor', maxBody: 6 << 20,
      handle: (request, ctx) => catchRequestErrors(async () => {
        if (request.method !== 'POST') throw new RequestError(405, 'POST')
        const raw: unknown = await request.json().catch(() => undefined)
        return jsonResponse(await documentEditor.change(ctx.document, raw as DocumentChange, ctx.member))
      }),
    },
  }
}
