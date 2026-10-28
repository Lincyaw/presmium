import { DOCUMENT_HISTORY_CHANGE_SCHEMA, DOCUMENT_HISTORY_MAX_REQUEST_CHARS, DOCUMENT_HISTORY_QUERY_SCHEMA, DOCUMENT_HISTORY_READ_SCHEMA } from '@lincyaw/kernel'
import type { DocumentHistory, DocumentHistoryQuery } from '@lincyaw/kernel'
import type { Call, ToolSpec } from './mcp.ts'
import { validateDocumentHistoryRead, validateDocumentHistoryChange } from '@lincyaw/kernel/node'

const documentProperty = { type: 'string', maxLength: 200, description: 'The served document directory; empty string names the root document, never the entire workspace.' }
const service = (call: Call): DocumentHistory => {
  if (!call.host.documentHistory) throw Object.assign(new Error('history-host-unavailable'), { status: 503 })
  return call.host.documentHistory
}
const budget = (call: Call) => { if (JSON.stringify(call.args).length > DOCUMENT_HISTORY_MAX_REQUEST_CHARS) throw Object.assign(new Error('history-request-too-large'), { status: 413 }) }
const readSchema = (schema: typeof DOCUMENT_HISTORY_QUERY_SCHEMA | typeof DOCUMENT_HISTORY_READ_SCHEMA) => ({ ...schema, properties: { document: documentProperty, ...schema.properties } })
const readArgs = (call: Call) => { budget(call); const { document: _document, ...query } = call.args; return query }
export const HISTORY_TOOLS: ToolSpec[] = [
  {
    name: 'get_document_history', kind: 'read', structured: true, inputSchema: readSchema(DOCUMENT_HISTORY_QUERY_SCHEMA),
    description: 'Reads the served document’s actual git history and exact next undo/redo IDs, without compiling or restoring. Root document "" is scoped. At most 20 compact entries and 7168 UTF-16 response characters; summaries/file lists may be abbreviated. Continue with snapshot and nextOffset. The historyBinding contains saved raw source plus actual git HEAD; malformed current JSON is still readable. No git returns available:false. Viewing never changes files.',
    run: async call => service(call).list(await call.document(), readArgs(call) as DocumentHistoryQuery, call.caller.member),
  },
  {
    name: 'read_history_file', kind: 'read', structured: true, inputSchema: readSchema(DOCUMENT_HISTORY_READ_SCHEMA),
    description: 'Reads a regular UTF-8 file at an exact reachable historical commit, scoped to this served document. Defaults to its lecture.json. Replies are bounded text fragments with actual SHA-256 and nextOffset; append decoded text and parse JSON only after complete. Rejects hidden, binary, symlink, cross-document and oversized files. This is a historical view, never checkout, restore, discard, compile or validation of the current document.',
    run: async call => { const query = readArgs(call); if (!validateDocumentHistoryRead(query)) throw Object.assign(new Error('history-read-invalid'), { status: 400 }); return service(call).read(await call.document(), query, call.caller.member) },
  },
  ...(['undo', 'redo', 'revert'] as const).map((which): ToolSpec => ({
    name: `${which}_document_change`, kind: 'operate', structured: true,
    inputSchema: { type: 'object', additionalProperties: false, required: ['request'], properties: { document: documentProperty, request: DOCUMENT_HISTORY_CHANGE_SCHEMA } },
    description: `Explicitly ${which}s ${which === 'revert' ? 'the specified reachable historical change' : 'the exact next target'} returned by get_document_history using its historyBinding and full expect commit. Requires host operate approval and existing editor/lock/review permissions. Refuses changed source/HEAD/target, mixed-document commits and uncommitted target files; never silently rebase. Use a stable intent id and retry identical input after lost ACK only while the returned result HEAD/source is current (64 process-local receipts). Uses the same Revisions transaction as Web; does not discard drafts, checkout, compile or play.`,
    run: async call => {
      budget(call)
      const document = await call.document(), request = call.args.request
      if (!validateDocumentHistoryChange(request)) throw Object.assign(new Error('history-change-invalid'), { status: 400 })
      const lang = (await call.host.documents()).find(item => item.dir === document)?.lang ?? 'zh-CN'
      await call.approve('operate', m => m.historyChange(which, request.expect), { lang, detail: JSON.stringify({ document, source: request.source, snapshot: request.snapshot, expect: request.expect }), check: () => service(call).checkChange(document, which, request, call.caller.member, 'agent') })
      return service(call).change(document, which, request, call.caller.member, 'agent')
    },
  })),
]
