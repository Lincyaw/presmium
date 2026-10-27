import { DOCUMENT_ENTRY, jsonResponse, pushStream, sseResponse } from '@lincyaw/kernel'
import { randomUUID } from 'node:crypto'
import { watch } from 'node:fs'
import { join } from 'node:path'
import type { DocumentChange, DocumentEvent, RequestContext, Route } from '@lincyaw/kernel'
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
  return {
    document: {
      role: 'editor',
      handle: (request, ctx) => catchRequestErrors(async () => {
        if (request.method !== 'GET') throw new RequestError(405, 'GET')
        return jsonResponse(await documentEditor.read(ctx.document, ctx.member))
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
