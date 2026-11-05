import { AUTHORING_CLIENT_MAX_CLIENTS, AUTHORING_CLIENT_MAX_REQUEST_CHARS, AUTHORING_CLIENT_MAX_RESPONSE_CHARS, AUTHORING_CLIENT_ACTION_SCHEMA, AUTHORING_CLIENT_QUERY_SCHEMA, AUTHORING_CLIENT_REQUEST_QUERY_SCHEMA, AUTHORING_CLIENT_REQUEST_SCHEMA, authoringClientActionChangesSource } from '@lincyaw/kernel'
import { randomUUID } from 'node:crypto'
import { validateAuthoringClientRequest } from '@lincyaw/kernel/node'
import type { AuthoringClients, AuthoringClientDescriptor, AuthoringClientAction, AuthoringClientRequestResult } from '@lincyaw/kernel'
import type { Call, ToolSpec } from './mcp.ts'
import { AUTHORING_WINDOW_ACTION_SCHEMA, AUTHORING_WINDOW_HANDLE_SCHEMA } from '@lincyaw/kernel'
import type { AuthoringWindowAction, AuthoringWindowReference } from '@lincyaw/kernel'
import { executeWindowAction, windowActionType, windowResult, windowService } from './window-actions.ts'

const documentProperty = { type: 'string', maxLength: 200, description: 'Served document directory; empty string means the root document.' }
const readSchema = (schema: typeof AUTHORING_CLIENT_QUERY_SCHEMA) => ({ ...schema, properties: { document: documentProperty, scope: { enum: ['document', 'workspace'] }, ...schema.properties as object } })
const service = (call: Call): AuthoringClients => { if (!call.host.authoringClients) throw Object.assign(new Error('authoring-client-host-unavailable'), { status: 503 }); return call.host.authoringClients }
const query = (call: Call) => { const { document: _document, scope: _scope, details: _details, ...value } = call.args; return value }
const requestReadSchema = () => ({
  type: 'object', additionalProperties: false,
  properties: { ...readSchema(AUTHORING_CLIENT_REQUEST_QUERY_SCHEMA).properties, handle: AUTHORING_WINDOW_HANDLE_SCHEMA },
  oneOf: [
    { required: ['handle'], not: { anyOf: ['document', 'scope', 'clientId', 'epoch', 'requestId'].map(key => ({ required: [key] })) } },
    { required: ['clientId', 'epoch', 'requestId'], not: { required: ['handle'] } },
  ],
})
const windowQuery = (call: Call) => typeof call.args.handle === 'string' ? call.args.handle : query(call) as AuthoringWindowReference
const isWindowQuery = (call: Call) => call.args.handle !== undefined || call.args.scope === 'workspace'
async function bounded(call: Call, run: () => Promise<unknown>) {
  if (JSON.stringify(call.args).length > AUTHORING_CLIENT_MAX_REQUEST_CHARS) throw Object.assign(new Error('client-request-too-large'), { status: 413 })
  const answer = await run()
  if (JSON.stringify(answer, null, 2).length > AUTHORING_CLIENT_MAX_RESPONSE_CHARS) throw Object.assign(new Error('client-response-too-large'), { status: 413 })
  return answer
}
export const AUTHORING_CLIENT_TOOLS: ToolSpec[] = [
  { name: 'editor_action', kind: 'operate', structured: true, audience: 'external', workspace: 'author',
    description: 'Requests one advertised browser action and waits briefly for its acknowledgement. Client source, connection, revision and playback binding are supplied internally. Comment draft restore needs only its draft reference; the client selects one native target and preserves current input. Advanced composerId/expectedCurrent must be supplied together. window.read, document.open and document.close control the root window, including home, through an unbound external owner connection; omit the top-level document for these actions. Omit clientId only when exactly one connected editor exists. A pending result is not completion; inspect its returned request reference without resending.',
    inputSchema: { type: 'object', additionalProperties: false, properties: { document: documentProperty, clientId: { type: 'string', maxLength: 80 }, action: businessActionSchema(), details: { type: 'boolean' } }, required: ['action'] },
    run: call => bounded(call, async () => {
      if (windowActionType((call.args.action as AuthoringWindowAction).type)) return executeWindowAction(call, call.args.action as AuthoringWindowAction)
      const document = await call.document(), own = service(call)
      const clients: AuthoringClientDescriptor[] = []
      let after: string | undefined
      let reviewRequired = false
      for (let page = 0; page < AUTHORING_CLIENT_MAX_CLIENTS; page++) {
        const report = await own.list(document, { ...typeof call.args.clientId === 'string' ? { clientId: call.args.clientId } : {}, ...after ? { after } : {} }, call.caller.member)
        clients.push(...report.clients.filter(client => client.connected))
        reviewRequired ||= report.unavailable.includes('source-writes-require-review')
        after = report.nextAfter
        if (!after) break
      }
      if (clients.length !== 1 || after) throw Object.assign(new Error('editor-context-unavailable'), { status: 409 })
      const client = clients[0]!, values = call.args.action as AuthoringClientAction
      if (client.pendingRequest) throw Object.assign(new Error('client-busy'), { status: 409, detail: { request: { document, clientId: client.clientId, epoch: client.epoch, requestId: client.pendingRequest.requestId } } })
      if (reviewRequired && authoringClientActionChangesSource(values.type) && values.type !== 'source.flush') throw Object.assign(new Error('authoring-review-required'), { status: 409 })
      const action = { ...values, ...['playback.play', 'playback.seek', 'playback.rate'].includes(values.type) ? { binding: client.snapshot.binding } : {} } as AuthoringClientAction
      const saved = values.type === 'body-drafts.retry' ? await call.host.authoring?.read(document, call.caller.member) : undefined
      if (values.type === 'body-drafts.retry' && !saved) throw Object.assign(new Error('authoring-host-unavailable'), { status: 503 })
      const source = saved ? { documentId: saved.content.id, version: saved.version, fingerprint: saved.fingerprint } : client.snapshot.source
      const request = { clientId: client.clientId, epoch: client.epoch, requestId: randomUUID(), source, expectedClientState: { connectionId: client.connectionId, revision: client.snapshot.revision }, action }
      if (!validateAuthoringClientRequest(request) || !client.snapshot.actions.includes(action.type)) throw Object.assign(new Error('client-action-unavailable'), { status: 409 })
      const lang = (await call.host.documents()).find(item => item.dir === document)?.lang ?? 'zh-CN'
      await call.approve('operate', messages => messages.authoringClientAction(action.type), { lang })
      call.signal.throwIfAborted()
      let result = await own.request(document, request, call.caller.member)
      const query = { clientId: client.clientId, epoch: client.epoch, requestId: request.requestId }, deadline = Date.now() + 1500
      while (['sent', 'executing'].includes(result.state) && Date.now() < deadline && !call.signal.aborted) {
        await new Promise(resolve => setTimeout(resolve, 40))
        result = await own.get(document, query, call.caller.member)
      }
      if (call.args.details) return result
      return editorResult(result, { document, ...query })
    }) },
  { name: 'cancel_authoring_client_request', kind: 'operate', structured: true, workspace: 'author',
    description: 'Requests cancellation using the exact returned request reference; window requests need only handle. It cannot run another browser action or cancel another member’s request. Returns cancellationRequested until a real browser acknowledgement or expiry; this does not claim a saved transaction was rolled back. Repeated cancellation never re-executes the action.',
    inputSchema: requestReadSchema(),
    run: call => bounded(call, async () => {
      if (isWindowQuery(call)) return windowResult(await windowService(call).cancel(windowQuery(call), call.caller.member))
      const document = await call.document(), own = service(call), reference = query(call) as { clientId: string, epoch: string, requestId: string }
      const result = await own.cancel!(document, reference, call.caller.member)
      return editorResult(result, { document, ...reference })
    }) },
  { name: 'get_authoring_clients', kind: 'read', structured: true, inputSchema: { ...readSchema(AUTHORING_CLIENT_QUERY_SCHEMA), properties: { ...readSchema(AUTHORING_CLIENT_QUERY_SCHEMA).properties, details: { type: 'boolean' } } },
    description: 'Reads bounded last reported Studio clients. Default document scope returns clientId, view/mode, position, editing flags, actions and pending request references. scope:workspace lists root windows, including home, for an unbound external owner; returns clientId, connected, location, actions, observedAt and pending handle. details:true includes transport metadata; full compatibility and trusted document queries keep their original reports. No editor text, drafts or credentials; offline reports are observations, never current capability. Use nextAfter for additional clients. No clients means unavailable. No compilation, open-document or UI mode change. Request<=4096 JSON chars; result<=7168 pretty UTF16 chars.',
    run: call => bounded(call, async () => {
      if (call.args.scope !== 'workspace') {
        const document = await call.document(), report = await service(call).list(document, query(call), call.caller.member)
        if (call.args.details || call.caller.confirmed || call.caller.toolset === 'all') return report
        return { ...report, clients: report.clients.map(client => ({ clientId: client.clientId, connected: client.connected,
          view: client.snapshot.view, ...client.snapshot.mode ? { mode: client.snapshot.mode } : {},
          ...client.snapshot.position ? { position: client.snapshot.position } : {},
          editing: client.snapshot.editing, actions: client.snapshot.actions, observedAt: client.observedAt,
          ...client.pendingRequest ? { pending: { request: { document, clientId: client.clientId, epoch: client.epoch, requestId: client.pendingRequest.requestId }, action: client.pendingRequest.action,
            ...client.pendingRequest.cancellationRequested ? { cancellationRequested: true } : {} } } : {} })) }
      }
      const report = await windowService(call).list(query(call), call.caller.member)
      if (call.args.details) return report
      return { ...report, clients: report.clients.map(client => ({ clientId: client.clientId, connected: client.connected, location: client.snapshot.location, actions: client.snapshot.actions, observedAt: client.observedAt,
        ...client.pendingRequest ? { pending: { handle: client.pendingRequest.requestId, action: client.pendingRequest.action, ...client.pendingRequest.cancellationRequested ? { cancellationRequested: true } : {} } } : {} })) }
    }) },
  { name: 'request_authoring_client', kind: 'operate', structured: true,
    inputSchema: { type: 'object', additionalProperties: false, properties: { document: documentProperty, request: AUTHORING_CLIENT_REQUEST_SCHEMA }, required: ['request'] },
    description: 'Advanced browser request with exact client/epoch, source, connection/revision and requestId; prefer editor_action for ordinary calls. Operate approval admits execution, not completion: inspect get_authoring_client_request for actual browser ACK. Only advertised actions execute. Draft inspect returns bounded metadata; draft read returns exact-reference UTF-16 JSON fragments with UTF-8 SHA-256; assemble before parsing. Restore preserves the current branch without submitting it. Body retry explicitly saves a current branch with strict canonical CAS; local body, comment and production draft reads remain available when saved-source observations are stale. Required review refuses browser source writes. Use the action schema for family-specific references and confirmation. Cancellation does not roll back a saved transaction. Lost ACKs, changed input/source, disconnect and timeout never authorize automatic resubmission; identical requestId reads its retained receipt. Passive state never includes draft content.',
    run: call => bounded(call, async () => {
      const document = await call.document(), request = call.args.request
      if (!validateAuthoringClientRequest(request)) throw Object.assign(new Error('client-request-invalid'), { status: 400 })
      const lang = (await call.host.documents()).find(item => item.dir === document)?.lang ?? 'zh-CN'
      await call.approve('operate', messages => messages.authoringClientAction(request.action.type), { lang })
      call.signal.throwIfAborted()
      return service(call).request(document, request, call.caller.member)
    }) },
  { name: 'get_authoring_client_request', kind: 'read', structured: true, inputSchema: { ...requestReadSchema(), properties: { ...requestReadSchema().properties, details: { type: 'boolean' } } },
    description: 'Reads the exact returned request reference (window: handle only), without redispatching. Compact connections return the same short receipt as editor_action; details:true includes the original transport receipt: sent/executing/done/refused/failed/expired. HTTP admission is not success. browser-acknowledged means an actual client observation; current additionally checks that client epoch/connection/state still matches. A stale completed receipt never describes a newly opened document. No action is re-dispatched by reading. Read the client again for subsequent commands; a receipt proves only its named action. Production draft inspection is metadata only; read content explicitly, and discard only an exact handle with confirm:true.',
    run: call => bounded(call, async () => {
      if (isWindowQuery(call)) return windowResult(await windowService(call).get(windowQuery(call), call.caller.member))
      const document = await call.document(), reference = query(call) as { clientId: string, epoch: string, requestId: string }
      const result = await service(call).get(document, reference, call.caller.member)
      return call.args.details || call.caller.confirmed || call.caller.toolset === 'all' ? result : editorResult(result, { document, ...reference })
    }) },
]

/** The browser owns the action schema. Only transport-owned playback bindings are omitted. */
function businessActionSchema() {
  const schema = structuredClone(AUTHORING_CLIENT_ACTION_SCHEMA)
  for (const variant of schema.oneOf ?? []) {
    if (variant.properties) delete variant.properties.binding
    if (Array.isArray(variant.required)) variant.required = variant.required.filter(key => key !== 'binding')
  }
  schema.oneOf?.push(...structuredClone(AUTHORING_WINDOW_ACTION_SCHEMA).oneOf ?? [])
  return schema
}
function editorResult(result: AuthoringClientRequestResult, request: { document: string, clientId: string, epoch: string, requestId: string }) {
  const action = result.result?.type === 'comment-drafts.restore'
    ? { type: result.result.type, family: result.result.family, restored: result.result.restored, targetState: result.result.targetState }
    : result.result?.type === 'comment-drafts.discard' ? { type: result.result.type, family: result.result.family, discarded: result.result.discarded }
    : result.result
  return { state: result.state, acknowledged: result.verification === 'browser-acknowledged', current: result.current,
    ...result.cancellationRequested ? { cancellationRequested: true } : {},
    ...result.snapshot?.mode ? { mode: result.snapshot.mode } : {},
    ...result.snapshot?.recording ? { recording: { phase: result.snapshot.recording.phase, ...result.snapshot.recording.candidate?.assetId ? { assetId: result.snapshot.recording.candidate.assetId } : {}, ...result.snapshot.recording.error ? { error: result.snapshot.recording.error } : {} } } : {},
    ...result.snapshot?.position ? { position: result.snapshot.position } : {},
    ...action ? { result: action } : {}, ...result.error ? { error: result.error } : {},
    ...['sent', 'executing'].includes(result.state) ? { request } : {} }
}
