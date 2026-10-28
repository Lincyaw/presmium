import { AUTHORING_CLIENT_MAX_REQUEST_CHARS, AUTHORING_CLIENT_MAX_RESPONSE_CHARS, AUTHORING_CLIENT_QUERY_SCHEMA, AUTHORING_CLIENT_REQUEST_QUERY_SCHEMA, AUTHORING_CLIENT_REQUEST_SCHEMA } from '@lincyaw/kernel'
import { validateAuthoringClientRequest } from '@lincyaw/kernel/node'
import type { AuthoringClients } from '@lincyaw/kernel'
import type { Call, ToolSpec } from './mcp.ts'

const documentProperty = { type: 'string', maxLength: 200, description: 'Served document directory; empty string means the root document.' }
const readSchema = (schema: typeof AUTHORING_CLIENT_QUERY_SCHEMA) => ({ ...schema, properties: { document: documentProperty, ...schema.properties as object } })
const service = (call: Call): AuthoringClients => { if (!call.host.authoringClients) throw Object.assign(new Error('authoring-client-host-unavailable'), { status: 503 }); return call.host.authoringClients }
const query = (call: Call) => { const { document: _document, ...value } = call.args; return value }
async function bounded(call: Call, run: () => Promise<unknown>) {
  if (JSON.stringify(call.args).length > AUTHORING_CLIENT_MAX_REQUEST_CHARS) throw Object.assign(new Error('client-request-too-large'), { status: 413 })
  const answer = await run()
  if (JSON.stringify(answer, null, 2).length > AUTHORING_CLIENT_MAX_RESPONSE_CHARS) throw Object.assign(new Error('client-response-too-large'), { status: 413 })
  return answer
}
export const AUTHORING_CLIENT_TOOLS: ToolSpec[] = [
  { name: 'get_authoring_clients', kind: 'read', structured: true, inputSchema: readSchema(AUTHORING_CLIENT_QUERY_SCHEMA),
    description: 'Reads bounded last reported state of actual Studio document clients, scoped to this document and member. No editor text, drafts, credentials or server-estimated playhead. Inspect connected, epoch, connectionId, snapshot.source/revision and actual actions; offline reports are observations, never current capability. Use nextAfter for additional clients. No clients means unavailable. No compilation, open-document or UI mode change. Request<=4096 JSON chars; result<=7168 pretty UTF16 chars.',
    run: call => bounded(call, async () => service(call).list(await call.document(), query(call), call.caller.member)) },
  { name: 'request_authoring_client', kind: 'operate', structured: true,
    inputSchema: { type: 'object', additionalProperties: false, properties: { document: documentProperty, request: AUTHORING_CLIENT_REQUEST_SCHEMA }, required: ['request'] },
    description: 'Explicitly requests one advertised browser action with exact clientId/epoch, CanonicalSource, connectionId/revision and intent requestId. Requires operate approval. Returns sent admission, never completed execution; poll get_authoring_client_request and inspect state, verification and current. Only a browser-owned channel can ACK. preview.prepare explicitly compiles/prepares the current clean saved source, pauses first, and preserves mode/position; no synthesis or playback. Its real prepared source/IR revision is in snapshot.preview. Input, a public modal, document switch, disconnect, Escape or the 30s request deadline cancels adoption; the human prepare default remains 45s. Playback needs an already valid exact plan/binding and real frame acknowledgement; other actions never auto-compile or enter Video/Present. source.flush flushes only canonical source edits, not comment/timing/recording form drafts. comment-drafts.inspect explicitly returns only comment-backup metadata; comment-drafts.read explicitly returns version/token-bound UTF-16 JSON-text fragments with UTF-8 SHA-256 and lengths. Assemble all fragments before parsing. These actions do not restore/discard drafts or flush forms. Default client listings and passive reports never include draft content. Comment changes invalidate client revision and old references; old successful receipts are historical when current=false. No complete local form/draft inspection is claimed. Read state again after any refused/failed/expired result. Identical intent retries return retained receipts without re-execution (64 process-local, same epoch); changed intent, stale source/state, disconnect or replaced epoch is refused. Never retry play or prepare with a new ID just because an ACK was lost.',
    run: call => bounded(call, async () => {
      const document = await call.document(), request = call.args.request
      if (!validateAuthoringClientRequest(request)) throw Object.assign(new Error('client-request-invalid'), { status: 400 })
      const lang = (await call.host.documents()).find(item => item.dir === document)?.lang ?? 'zh-CN'
      await call.approve('operate', messages => messages.authoringClientAction(request.action.type), { lang, detail: JSON.stringify({ document, request }) })
      call.signal.throwIfAborted()
      return service(call).request(document, request, call.caller.member)
    }) },
  { name: 'get_authoring_client_request', kind: 'read', structured: true, inputSchema: readSchema(AUTHORING_CLIENT_REQUEST_QUERY_SCHEMA),
    description: 'Reads this exact retained browser request receipt: sent/executing/done/refused/failed/expired. HTTP admission is not success. browser-acknowledged means an actual client observation; current additionally checks that client epoch/connection/state still matches. A stale completed receipt never describes a newly opened document. No action is re-dispatched by reading. Read the client again for subsequent commands; recording, comment restore/discard and other draft families cannot be inferred from these explicit comment-only reads or playback.',
    run: call => bounded(call, async () => service(call).get(await call.document(), query(call) as { clientId: string, epoch: string, requestId: string }, call.caller.member)) },
]
