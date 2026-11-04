import { AUTHORING_CLIENT_MAX_CLIENTS, AUTHORING_WINDOW_ACTIONS, hasRole } from '@lincyaw/kernel'
import type { AuthoringWindowAction, AuthoringWindowDescriptor, AuthoringWindowReference, AuthoringWindowRequestResult, AuthoringWindows } from '@lincyaw/kernel'
import { randomUUID } from 'node:crypto'
import type { Call } from './mcp.ts'

export const windowActionType = (type: string) => (AUTHORING_WINDOW_ACTIONS as readonly string[]).includes(type)
export function windowService(call: Call): AuthoringWindows {
  if (call.caller.document !== undefined || call.caller.confirmed || !hasRole(call.caller.member, 'owner') || call.args.document !== undefined) throw Object.assign(new Error('window-permission-denied'), { status: 403 })
  if (!call.host.authoringWindows) throw Object.assign(new Error('window-host-unavailable'), { status: 503 })
  return call.host.authoringWindows
}
export const windowReference = (requestId: string) => ({ handle: requestId })
export function windowResult(result: AuthoringWindowRequestResult) {
  return { state: result.state, acknowledged: result.acknowledged, current: result.current,
    ...result.outcome ? { outcome: result.outcome } : {}, ...result.snapshot ? { location: result.snapshot.location } : {},
    ...result.error ? { error: result.error } : {}, ...result.cancellationRequested ? { cancellationRequested: true } : {},
    ...['sent', 'executing'].includes(result.state) ? { request: windowReference(result.requestId) } : {} }
}
export async function executeWindowAction(call: Call, action: AuthoringWindowAction) {
  const service = windowService(call), clients: AuthoringWindowDescriptor[] = []
  let after: string | undefined
  for (let i = 0; i < AUTHORING_CLIENT_MAX_CLIENTS; i++) {
    const page = await service.list({ ...typeof call.args.clientId === 'string' ? { clientId: call.args.clientId } : {}, ...after ? { after } : {} }, call.caller.member)
    clients.push(...page.clients.filter(client => client.connected)); after = page.nextAfter; if (!after) break
  }
  if (clients.length !== 1 || after) throw Object.assign(new Error('window-context-unavailable'), { status: 409 })
  const client = clients[0]!
  if (client.pendingRequest) throw Object.assign(new Error('window-busy'), { status: 409, detail: { request: windowReference(client.pendingRequest.requestId) } })
  if (!client.snapshot.actions.includes(action.type)) throw Object.assign(new Error('window-action-unavailable'), { status: 409 })
  let target: { document: string, documentId: string } | undefined
  if (action.type === 'document.open') {
    if (!(await call.host.documents()).some(value => value.dir === action.document)) throw Object.assign(new Error('window-target-unavailable'), { status: 404 })
    const value = await call.host.authoring?.read(action.document, call.caller.member)
    if (!value) throw Object.assign(new Error('window-target-unavailable'), { status: 503 })
    target = { document: action.document, documentId: value.content.id }
  }
  const request = { clientId: client.clientId, epoch: client.epoch, connectionId: client.connectionId, revision: client.snapshot.revision, requestId: randomUUID(), action, ...target ? { target } : {} }
  const document = action.type === 'document.open' ? action.document : client.snapshot.location.type === 'document' ? client.snapshot.location.document : undefined
  const lang = (await call.host.documents()).find(value => value.dir === document)?.lang ?? 'zh-CN'
  await call.approve('operate', messages => messages.authoringClientAction(action.type), { lang })
  call.signal.throwIfAborted()
  let result = await service.request(request, call.caller.member)
  const query: AuthoringWindowReference = { clientId: client.clientId, epoch: client.epoch, requestId: request.requestId }, deadline = Date.now() + 1500
  while (['sent', 'executing'].includes(result.state) && Date.now() < deadline && !call.signal.aborted) {
    await new Promise(resolve => setTimeout(resolve, 40)); result = await service.get(query, call.caller.member)
  }
  return call.args.details ? { scope: 'workspace', ...result } : windowResult(result)
}
