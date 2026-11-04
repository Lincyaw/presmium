import { randomBytes, randomUUID, createHash } from 'node:crypto'
import { AUTHORING_CLIENT_MAX_CLIENTS, AUTHORING_CLIENT_MAX_REQUESTS, AUTHORING_CLIENT_MAX_REQUEST_CHARS, AUTHORING_CLIENT_MAX_RESPONSE_CHARS, AUTHORING_CLIENT_REQUEST_TIMEOUT_MS, hasRole, isRecord, jsonResponse, problemResponse, pushStream, sseResponse } from '@lincyaw/kernel'
import type { AuthoringWindowAcknowledgement, AuthoringWindowDescriptor, AuthoringWindowEvent, AuthoringWindowLease, AuthoringWindowOpen, AuthoringWindowReference, AuthoringWindowReport, AuthoringWindowRequest, AuthoringWindowRequestResult, AuthoringWindows, Member, Route } from '@lincyaw/kernel'
import { validateAuthoringClientLease, validateAuthoringClientQuery, validateAuthoringClientRequestQuery, validateAuthoringWindowAcknowledgement, validateAuthoringWindowHandle, validateAuthoringWindowOpen, validateAuthoringWindowReport, validateAuthoringWindowRequest } from '@lincyaw/kernel/node'
import { catchRequestErrors, RequestError } from './errors.ts'

type Client = { member: string, credential: string, sequence: number, signature?: string, value: AuthoringWindowDescriptor, send?(event: AuthoringWindowEvent): void, close?(): void }
type Pending = { member: string, signature: string, request: AuthoringWindowRequest, value: AuthoringWindowRequestResult, timer?: ReturnType<typeof setTimeout> }
const terminal = (value: Pending) => !['sent', 'executing'].includes(value.value.state)
const size = (value: unknown) => JSON.stringify(value, null, 2).length
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value, (_, item) => isRecord(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item)).digest('hex')
const budget = (value: unknown, maximum = AUTHORING_CLIENT_MAX_REQUEST_CHARS) => { if (value === undefined || size(value) > maximum) throw new RequestError(413, 'window-request-too-large') }

/** Root window control has its own lifetime, not the currently attached document's authority. */
export function createAuthoringWindows(target: (document: string, member: Member) => string) {
  const clients = new Map<string, Client>(), requests = new Map<string, Pending>()
  let closed = false
  const authorize = (member: Member) => { if (closed) throw new RequestError(503, 'window-owner-closed'); if (!hasRole(member, 'owner')) throw new RequestError(403, 'window-permission-denied') }
  const clientKey = (member: string, clientId: string) => JSON.stringify([member, clientId])
  const requestKey = (member: string, value: AuthoringWindowReference) => JSON.stringify([member, value.clientId, value.epoch, value.requestId])
  const finish = (pending: Pending, state: AuthoringWindowRequestResult['state'], code?: string) => {
    if (terminal(pending)) return
    clearTimeout(pending.timer); pending.timer = undefined
    pending.value = { ...pending.value, state, ...code ? { error: { code } } : {} }
    if (state === 'expired') clients.get(clientKey(pending.member, pending.request.clientId))?.send?.({ type: 'cancel', requestId: pending.request.requestId, connectionId: pending.request.connectionId })
  }
  const disconnect = (client: Client, connectionId: string) => {
    if (client.value.connectionId !== connectionId) return
    client.value = { ...client.value, connected: false }; client.send = undefined; client.close = undefined
    for (const pending of requests.values()) if (!terminal(pending) && pending.member === client.member && pending.request.clientId === client.value.clientId && pending.request.connectionId === connectionId) finish(pending, 'expired', 'window-disconnected')
  }
  const connection = (lease: AuthoringWindowLease, member: Member) => {
    authorize(member)
    const client = clients.get(clientKey(member.id, lease.clientId))
    if (!client?.value.connected || client.value.epoch !== lease.epoch || client.value.connectionId !== lease.connectionId || client.credential !== lease.credential) throw new RequestError(409, 'window-connection-changed')
    return client
  }
  const targetCurrent = (request: AuthoringWindowRequest, member: Member) => {
    if (request.action.type === 'document.open') {
      if (!request.target || request.target.document !== request.action.document || target(request.target.document, member) !== request.target.documentId) throw new RequestError(409, 'window-target-changed')
    } else if (request.target) throw new RequestError(400, 'window-request-invalid')
  }
  const readResult = (pending: Pending, member: Member): AuthoringWindowRequestResult => {
    const client = clients.get(clientKey(member.id, pending.request.clientId)), value = pending.value
    let current = Boolean(client?.value.connected && client.value.epoch === value.epoch && client.value.connectionId === value.connectionId && value.snapshot && digest(client.value.snapshot) === digest(value.snapshot))
    try { targetCurrent(pending.request, member) } catch { current = false }
    return structuredClone({ ...value, current })
  }
  const report = (client: Client, value: AuthoringWindowReport) => {
    const signature = digest(value)
    if (value.sequence < client.sequence || value.sequence === client.sequence && signature !== client.signature || value.snapshot.revision < client.value.snapshot.revision) throw new RequestError(409, 'window-report-superseded')
    if (value.sequence === client.sequence) return
    client.sequence = value.sequence; client.signature = signature
    client.value = { ...client.value, snapshot: structuredClone(value.snapshot), observedAt: new Date().toISOString() }
  }
  const retained = (reference: AuthoringWindowReference | string, member: Member) => {
    authorize(member); budget(reference)
    if (typeof reference === 'string') {
      if (!validateAuthoringWindowHandle(reference)) throw new RequestError(400, 'window-query-invalid')
      const matches = [...requests.values()].filter(value => value.member === member.id && value.request.requestId === reference)
      if (matches.length > 1) throw new RequestError(409, 'window-query-ambiguous')
      if (!matches[0]) throw new RequestError(404, 'window-request-not-found')
      return matches[0]
    }
    if (!validateAuthoringClientRequestQuery(reference)) throw new RequestError(400, 'window-query-invalid')
    const pending = requests.get(requestKey(member.id, reference))
    if (!pending) throw new RequestError(404, 'window-request-not-found')
    return pending
  }
  const service: AuthoringWindows = {
    async list(query, member) {
      authorize(member); budget(query)
      if (!validateAuthoringClientQuery(query)) throw new RequestError(400, 'window-query-invalid')
      const all = [...clients.values()].filter(client => client.member === member.id && (!query.clientId || client.value.clientId === query.clientId) && (!query.after || client.value.clientId > query.after)).sort((a, b) => a.value.clientId.localeCompare(b.value.clientId))
      const answer = { scope: 'workspace' as const, clients: [] as AuthoringWindowDescriptor[] }
      for (const client of all) {
        const value = structuredClone(client.value), pending = [...requests.values()].find(request => request.member === member.id && request.request.clientId === value.clientId && !terminal(request))
        if (pending) { value.pendingRequest = { requestId: pending.request.requestId, action: pending.request.action.type, ...pending.value.cancellationRequested ? { cancellationRequested: true } : {} }; value.snapshot.actions = [] }
        if (size({ ...answer, clients: [...answer.clients, value], nextAfter: value.clientId }) > AUTHORING_CLIENT_MAX_RESPONSE_CHARS) break
        answer.clients.push(value)
      }
      if (all.length && !answer.clients.length) throw new RequestError(413, 'window-state-too-large')
      return { ...answer, ...answer.clients.length < all.length ? { nextAfter: answer.clients.at(-1)!.clientId } : {} }
    },
    async request(request, member) {
      authorize(member); budget(request)
      if (!validateAuthoringWindowRequest(request)) throw new RequestError(400, 'window-request-invalid')
      const key = requestKey(member.id, request), signature = digest(request), known = requests.get(key)
      if (known) { if (signature !== known.signature) throw new RequestError(409, 'window-request-id-reused'); return readResult(known, member) }
      const client = clients.get(clientKey(member.id, request.clientId)), state = client?.value
      if (!state?.connected || state.epoch !== request.epoch || state.connectionId !== request.connectionId) throw new RequestError(409, 'window-unavailable')
      if (state.snapshot.revision !== request.revision) throw new RequestError(409, 'window-state-changed')
      if (!state.snapshot.actions.includes(request.action.type)) throw new RequestError(409, 'window-action-unavailable')
      if ([...requests.values()].some(value => value.member === member.id && value.request.clientId === request.clientId && !terminal(value))) throw new RequestError(409, 'window-busy')
      targetCurrent(request, member)
      while (requests.size >= AUTHORING_CLIENT_MAX_REQUESTS) { const old = [...requests].find(([, value]) => terminal(value)); if (!old) throw new RequestError(429, 'window-request-capacity'); requests.delete(old[0]) }
      const now = Date.now(), value: AuthoringWindowRequestResult = { clientId: state.clientId, epoch: state.epoch, connectionId: state.connectionId, requestId: request.requestId, action: request.action.type,
        state: 'sent', admittedAt: new Date(now).toISOString(), expiresAt: new Date(now + AUTHORING_CLIENT_REQUEST_TIMEOUT_MS).toISOString(), acknowledged: false, current: false }
      const pending: Pending = { member: member.id, signature, request: structuredClone(request), value }
      pending.timer = setTimeout(() => finish(pending, 'expired', 'window-request-timeout'), AUTHORING_CLIENT_REQUEST_TIMEOUT_MS)
      requests.set(key, pending); client!.send?.({ type: 'request', request: pending.request, expiresAt: value.expiresAt })
      return readResult(pending, member)
    },
    async get(reference, member) { return readResult(retained(reference, member), member) },
    async cancel(reference, member) {
      const pending = retained(reference, member)
      if (!terminal(pending) && !pending.value.cancellationRequested) { pending.value.cancellationRequested = true; clients.get(clientKey(member.id, pending.request.clientId))?.send?.({ type: 'cancel', requestId: pending.request.requestId, connectionId: pending.value.connectionId }) }
      return readResult(pending, member)
    },
  }
  const register = (value: AuthoringWindowOpen, member: Member): AuthoringWindowLease => {
    authorize(member)
    const key = clientKey(member.id, value.clientId), old = clients.get(key)
    if (!old && clients.size >= AUTHORING_CLIENT_MAX_CLIENTS) { const disposable = [...clients].find(([, client]) => !client.value.connected); if (!disposable) throw new RequestError(429, 'window-capacity'); clients.delete(disposable[0]) }
    old?.close?.()
    const credential = randomBytes(32).toString('base64url'), connectionId = randomUUID()
    clients.set(key, { member: member.id, credential, sequence: -1, value: { clientId: value.clientId, epoch: value.epoch, connectionId, connected: false, snapshot: structuredClone(value.snapshot), observedAt: new Date().toISOString() } })
    return { clientId: value.clientId, epoch: value.epoch, connectionId, credential }
  }
  const acknowledge = (lease: AuthoringWindowLease, value: AuthoringWindowAcknowledgement, member: Member) => {
    const client = connection(lease, member), pending = requests.get(requestKey(member.id, { ...lease, requestId: value.requestId }))
    if (pending && Date.now() >= Date.parse(pending.value.expiresAt)) finish(pending, 'expired', 'window-request-timeout')
    if (!pending || terminal(pending) || pending.request.connectionId !== lease.connectionId) throw new RequestError(409, 'window-request-expired')
    if (value.state === 'executing' && pending.value.cancellationRequested) throw new RequestError(409, 'window-request-cancelled')
    if (value.state === 'executing' && pending.value.state !== 'sent' || value.state === 'done' && pending.value.state !== 'executing') throw new RequestError(409, 'window-ack-state-invalid')
    if (value.state !== 'done' && value.outcome !== undefined || (value.state === 'done' || value.state === 'executing') && value.error) throw new RequestError(400, 'window-ack-invalid')
    if (value.state === 'executing' && (value.snapshot.revision !== pending.request.revision || digest(value.snapshot) !== digest(client.value.snapshot))) throw new RequestError(409, 'window-state-changed')
    if (value.state === 'executing' || value.state === 'done') targetCurrent(pending.request, member)
    if (value.state === 'done') {
      const action = pending.request.action, location = value.snapshot.location
      if (value.snapshot.revision < pending.request.revision || action.type === 'window.read' && (value.outcome !== 'observed' || value.snapshot.revision !== pending.request.revision)
        || action.type === 'document.open' && (!['opened', 'unchanged'].includes(value.outcome ?? '') || location.type !== 'document' || location.status !== 'ready' || location.document !== action.document || location.documentId !== pending.request.target?.documentId)
        || action.type === 'document.close' && (!['closed', 'unchanged'].includes(value.outcome ?? '') || location.type !== 'home')) throw new RequestError(409, 'window-action-not-verified')
    }
    report(client, value)
    pending.value = { ...pending.value, snapshot: structuredClone(value.snapshot), ...value.outcome ? { outcome: value.outcome } : {}, ...value.error ? { error: value.error } : {}, acknowledged: true }
    if (value.state === 'executing') pending.value.state = 'executing'; else finish(pending, value.state)
    return { accepted: true }
  }
  const post = (kind: 'register' | 'report' | 'ack'): Route => ({ role: 'owner', maxBody: 16384, handle: (request, ctx) => catchRequestErrors(async () => {
    if (request.method !== 'POST') return problemResponse(405, 'POST')
    const value: unknown = await request.json().catch(() => undefined); budget(value, AUTHORING_CLIENT_MAX_RESPONSE_CHARS)
    if (kind === 'register') { if (!validateAuthoringWindowOpen(value)) throw new RequestError(400, 'window-open-invalid'); return jsonResponse(register(value, ctx.member)) }
    if (!isRecord(value) || Object.keys(value).some(key => !['connection', 'report'].includes(key)) || !validateAuthoringClientLease(value.connection)) throw new RequestError(400, 'window-connection-invalid')
    if (kind === 'ack') { if (!validateAuthoringWindowAcknowledgement(value.report)) throw new RequestError(400, 'window-ack-invalid'); return jsonResponse(acknowledge(value.connection, value.report, ctx.member)) }
    if (!validateAuthoringWindowReport(value.report)) throw new RequestError(400, 'window-report-invalid')
    report(connection(value.connection, ctx.member), value.report); return jsonResponse({ accepted: true })
  }) })
  return { service, routes: {
    'authoring-windows/register': post('register'), 'authoring-windows/report': post('report'), 'authoring-windows/ack': post('ack'),
    'authoring-windows/events': { role: 'owner', handle: (request, ctx) => catchRequestErrors(async () => {
      authorize(ctx.member)
      if (request.method !== 'GET') return problemResponse(405, 'GET')
      const query = new URL(request.url).searchParams, lease = { clientId: query.get('clientId'), epoch: query.get('epoch'), connectionId: query.get('connectionId'), credential: request.headers.get('X-Presmium-Authoring-Client') }
      if (!validateAuthoringClientLease(lease)) throw new RequestError(400, 'window-connection-invalid')
      const client = clients.get(clientKey(ctx.member.id, lease.clientId))
      if (!client || client.value.epoch !== lease.epoch || client.credential !== lease.credential) throw new RequestError(409, 'window-connection-changed')
      client.close?.(); const connectionId = randomUUID()
      client.value = { ...client.value, connected: true, connectionId }
      const stream = pushStream<{ event: string, data: AuthoringWindowEvent }>(push => { client.send = data => push({ event: 'authoring-client', data }); return () => disconnect(client, connectionId) }, { signal: request.signal })
      client.close = () => stream.end(); client.send?.({ type: 'connected', connectionId })
      return sseResponse(stream, request.signal)
    }) } satisfies Route,
  }, async close() { closed = true; for (const client of clients.values()) client.close?.(); for (const pending of requests.values()) finish(pending, 'expired', 'window-owner-closed'); clients.clear(); requests.clear() } }
}
