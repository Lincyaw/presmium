import { randomBytes, randomUUID, createHash } from 'node:crypto'
import { AUTHORING_CLIENT_MAX_CLIENTS, AUTHORING_CLIENT_MAX_REQUESTS, AUTHORING_CLIENT_MAX_REQUEST_CHARS, AUTHORING_CLIENT_MAX_RESPONSE_CHARS, AUTHORING_CLIENT_REQUEST_TIMEOUT_MS, DOCUMENT_ENTRY, fnv1a64, hasRole, isRecord, jsonResponse, problemResponse, pushStream, sseResponse } from '@lincyaw/kernel'
import type { AuthoringClientAcknowledgement, AuthoringClientConnection, AuthoringClientDescriptor, AuthoringClientEvent, AuthoringClientLease, AuthoringClientOpen, AuthoringClientReport, AuthoringClientRequest, AuthoringClientRequestResult, AuthoringClients, CanonicalSource, Member, PushStream, Route } from '@lincyaw/kernel'
import { validateAuthoringClientAcknowledgement, validateAuthoringClientLease, validateAuthoringClientOpen, validateAuthoringClientQuery, validateAuthoringClientReport, validateAuthoringClientRequest, validateAuthoringClientRequestQuery } from '@lincyaw/kernel/node'
import { readAuthoringDocument } from './document-editor.ts'
import { catchRequestErrors, RequestError } from './errors.ts'
import type { SourceEditor } from './source-editor.ts'

type Client = { member: string, credential: string, value: AuthoringClientDescriptor, sequence: number, lastSignature?: string, send?(value: AuthoringClientEvent): void, close?(): void }
type Pending = { member: string, signature: string, request: AuthoringClientRequest, value: AuthoringClientRequestResult, timer?: ReturnType<typeof setTimeout> }
const sameSource = (a: CanonicalSource, b: CanonicalSource) => a.documentId === b.documentId && a.version === b.version && a.fingerprint === b.fingerprint
const size = (value: unknown) => JSON.stringify(value, null, 2).length
const budget = (value: unknown) => { const text = JSON.stringify(value); if (text === undefined) throw new RequestError(400, 'client-request-invalid'); if (text.length > AUTHORING_CLIENT_MAX_REQUEST_CHARS) throw new RequestError(413, 'client-request-too-large') }
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value, (_, entry) => isRecord(entry) ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a.localeCompare(b))) : entry)).digest('hex')
const terminal = (pending: Pending) => !['sent', 'executing'].includes(pending.value.state)

/** Ephemeral live-client control. It owns no document writer, compilation or durable task ledger. */
export function createAuthoringClients(editor: SourceEditor) {
  const clients = new Map<string, Client>(), requests = new Map<string, Pending>()
  let closed = false
  const clientKey = (member: string, clientId: string) => JSON.stringify([member, clientId])
  const requestKey = (member: string, document: string, query: { clientId: string, epoch: string, requestId: string }) => JSON.stringify([member, document, query.clientId, query.epoch, query.requestId])
  const authorize = (document: string, member: Member) => {
    if (closed) throw new RequestError(503, 'client-owner-closed')
    if (!hasRole(member, 'editor')) throw new RequestError(403, 'client-permission-denied')
    editor.readableFile({ document, home: false }, document ? `${document}/${DOCUMENT_ENTRY}` : DOCUMENT_ENTRY, member)
  }
  const current = (document: string, member: Member) => {
    authorize(document, member)
    const opened = readAuthoringDocument(editor, { document, member })
    return { documentId: opened.content.id, version: opened.source.version, fingerprint: fnv1a64(opened.source.content) }
  }
  const connection = (document: string, lease: AuthoringClientLease, member: Member) => {
    authorize(document, member)
    const client = clients.get(clientKey(member.id, lease.clientId))
    if (!client || client.value.document !== document || client.value.epoch !== lease.epoch || client.credential !== lease.credential
      || client.value.connectionId !== lease.connectionId || !client.value.connected) throw new RequestError(409, 'client-connection-changed')
    return client
  }
  const finish = (pending: Pending, state: AuthoringClientRequestResult['state'], code?: string) => {
    if (terminal(pending)) return
    clearTimeout(pending.timer); pending.timer = undefined
    pending.value = { ...pending.value, state, ...code ? { error: { code } } : {} }
    if (state === 'expired') clients.get(clientKey(pending.member, pending.request.clientId))?.send?.({ type: 'cancel', requestId: pending.request.requestId, connectionId: pending.request.expectedClientState.connectionId })
  }
  const disconnect = (client: Client, connectionId: string) => {
    if (client.value.connectionId !== connectionId) return
    client.value = { ...client.value, connected: false }
    client.send = undefined; client.close = undefined
    for (const pending of requests.values()) if (!terminal(pending) && pending.member === client.member && pending.request.clientId === client.value.clientId && pending.request.epoch === client.value.epoch
      && pending.request.expectedClientState.connectionId === connectionId) finish(pending, 'expired', 'client-disconnected')
  }
  const readResult = (pending: Pending, actual?: CanonicalSource): AuthoringClientRequestResult => {
    const client = clients.get(clientKey(pending.member, pending.request.clientId)), value = pending.value
    return structuredClone({ ...value, current: Boolean(client?.value.connected && client.value.epoch === value.epoch && client.value.connectionId === value.connectionId
      && value.snapshot && actual && sameSource(actual, value.snapshot.source) && client.value.snapshot.revision === value.snapshot.revision && sameSource(client.value.snapshot.source, value.snapshot.source)) })
  }
  const report = (client: Client, value: AuthoringClientReport, signature: string) => {
    if (value.sequence < client.sequence || value.sequence === client.sequence && client.lastSignature !== signature) throw new RequestError(409, 'client-report-superseded')
    if (value.sequence === client.sequence) return
    if (value.snapshot.revision < client.value.snapshot.revision) throw new RequestError(409, 'client-state-superseded')
    client.sequence = value.sequence; client.lastSignature = signature
    client.value = { ...client.value, snapshot: structuredClone(value.snapshot), observedAt: new Date().toISOString() }
  }
  const service: AuthoringClients = {
    async list(document, query, member) {
      authorize(document, member); budget(query)
      if (!validateAuthoringClientQuery(query)) throw new RequestError(400, 'client-query-invalid')
      const all = [...clients.values()].filter(client => client.member === member.id && client.value.document === document && (!query.clientId || client.value.clientId === query.clientId)
        && (!query.after || client.value.clientId > query.after)).sort((a, b) => a.value.clientId.localeCompare(b.value.clientId))
      const answer = { document, clients: [] as AuthoringClientDescriptor[], unavailable: ['recording', 'draft-content', 'review', 'open-document', 'compile'] }
      for (const client of all) {
        const row = structuredClone(client.value)
        if (size({ ...answer, clients: [...answer.clients, row], nextAfter: row.clientId }) > AUTHORING_CLIENT_MAX_RESPONSE_CHARS) break
        answer.clients.push(row)
      }
      if (all.length && !answer.clients.length) throw new RequestError(413, 'client-state-too-large')
      return { ...answer, ...answer.clients.length < all.length ? { nextAfter: answer.clients.at(-1)!.clientId } : {} }
    },
    async request(document, request, member) {
      const actual = current(document, member); budget(request)
      if (!validateAuthoringClientRequest(request)) throw new RequestError(400, 'client-request-invalid')
      const key = requestKey(member.id, document, request), signature = digest(request), known = requests.get(key)
      if (known) { if (known.signature !== signature) throw new RequestError(409, 'client-request-id-reused'); return readResult(known, actual) }
      const client = clients.get(clientKey(member.id, request.clientId)), state = client?.value
      if (!client || !state?.connected || state.document !== document || state.epoch !== request.epoch) throw new RequestError(409, 'client-unavailable')
      if (state.connectionId !== request.expectedClientState.connectionId || state.snapshot.revision !== request.expectedClientState.revision) throw new RequestError(409, 'client-state-changed')
      if (!sameSource(actual, request.source) || !sameSource(state.snapshot.source, request.source)) throw new RequestError(409, 'client-source-changed')
      if (!state.snapshot.actions.includes(request.action.type)) throw new RequestError(409, 'client-action-unavailable')
      if ([...requests.values()].some(value => !terminal(value) && value.member === member.id && value.request.clientId === request.clientId)) throw new RequestError(409, 'client-busy')
      while (requests.size >= AUTHORING_CLIENT_MAX_REQUESTS) {
        const disposable = [...requests].find(([, value]) => terminal(value))
        if (!disposable) throw new RequestError(429, 'client-request-capacity')
        requests.delete(disposable[0])
      }
      const now = Date.now(), value: AuthoringClientRequestResult = { document, clientId: state.clientId, epoch: state.epoch, connectionId: state.connectionId, requestId: request.requestId, action: request.action.type, source: request.source,
        state: 'sent', admittedAt: new Date(now).toISOString(), expiresAt: new Date(now + AUTHORING_CLIENT_REQUEST_TIMEOUT_MS).toISOString(), verification: 'not-acknowledged', current: false }
      const pending: Pending = { member: member.id, signature, request: structuredClone(request), value }
      pending.timer = setTimeout(() => finish(pending, 'expired', 'client-request-timeout'), AUTHORING_CLIENT_REQUEST_TIMEOUT_MS)
      requests.set(key, pending)
      client.send?.({ type: 'request', request: pending.request, expiresAt: value.expiresAt })
      return readResult(pending, actual)
    },
    async get(document, query, member) {
      authorize(document, member); budget(query)
      if (!validateAuthoringClientRequestQuery(query)) throw new RequestError(400, 'client-request-query-invalid')
      const pending = requests.get(requestKey(member.id, document, query))
      if (!pending) throw new RequestError(404, 'client-request-not-found')
      let actual: CanonicalSource | undefined
      try { actual = current(document, member) } catch { /* An old receipt stays readable if the current source is invalid. */ }
      return readResult(pending, actual)
    },
  }
  const register = (document: string, value: AuthoringClientOpen, member: Member): AuthoringClientLease => {
    const source = current(document, member)
    // Opening a transport may race an ordinary autosave. Requests still require the exact current source.
    if (source.documentId !== value.snapshot.source.documentId) throw new RequestError(409, 'client-source-changed')
    const key = clientKey(member.id, value.clientId), old = clients.get(key)
    if (!old && clients.size >= AUTHORING_CLIENT_MAX_CLIENTS) {
      const disposable = [...clients].find(([, client]) => !client.value.connected)
      if (!disposable) throw new RequestError(429, 'client-capacity')
      clients.delete(disposable[0])
    }
    old?.close?.()
    const credential = randomBytes(32).toString('base64url'), connectionId = randomUUID()
    clients.set(key, { member: member.id, credential, sequence: -1, value: { document, clientId: value.clientId, epoch: value.epoch, connectionId, connected: false,
      snapshot: structuredClone(value.snapshot), observedAt: new Date().toISOString(), verification: 'reported-state' } })
    return { clientId: value.clientId, epoch: value.epoch, connectionId, credential }
  }
  const open = (document: string, lease: AuthoringClientLease, member: Member, signal: AbortSignal): PushStream<{ event: string, data: AuthoringClientEvent }> => {
    authorize(document, member)
    const client = clients.get(clientKey(member.id, lease.clientId))
    if (!client || client.credential !== lease.credential || client.value.document !== document || client.value.epoch !== lease.epoch) throw new RequestError(409, 'client-connection-changed')
    client.close?.()
    const connectionId = randomUUID()
    client.value = { ...client.value, connected: true, connectionId }
    const stream = pushStream<{ event: string, data: AuthoringClientEvent }>(push => {
      client.send = data => push({ event: 'authoring-client', data })
      return () => disconnect(client, connectionId)
    }, { signal })
    client.close = () => stream.end()
    client.send?.({ type: 'connected', connectionId })
    return stream
  }
  const acknowledge = (document: string, lease: AuthoringClientLease, ack: AuthoringClientAcknowledgement, member: Member) => {
    const client = connection(document, lease, member), pending = requests.get(requestKey(member.id, document, { ...lease, requestId: ack.requestId }))
    if (!pending || terminal(pending) || pending.request.expectedClientState.connectionId !== lease.connectionId) throw new RequestError(409, 'client-request-expired')
    if (ack.state === 'executing' && pending.value.state !== 'sent' || ack.state === 'done' && pending.value.state !== 'executing') throw new RequestError(409, 'client-ack-state-invalid')
    if ((ack.state === 'executing' || ack.state === 'done') && !sameSource(ack.snapshot.source, pending.request.source) && !(ack.state === 'done' && pending.request.action.type === 'source.flush' && ack.snapshot.source.documentId === pending.request.source.documentId)) throw new RequestError(409, 'client-source-changed')
    const actual = ack.state === 'executing' || ack.state === 'done' ? current(document, member) : undefined
    if (ack.state === 'executing' && (ack.snapshot.revision !== pending.request.expectedClientState.revision || !actual || !sameSource(actual, pending.request.source))) throw new RequestError(409, 'client-state-changed')
    if (ack.state === 'done' && (!actual || !sameSource(actual, ack.snapshot.source))) throw new RequestError(409, 'client-source-changed')
    report(client, ack, digest(ack))
    pending.value = { ...pending.value, observedAt: new Date().toISOString(), snapshot: structuredClone(ack.snapshot), verification: 'browser-acknowledged', ...ack.error ? { error: structuredClone(ack.error) } : {} }
    if (ack.state === 'executing') pending.value.state = 'executing'
    else finish(pending, ack.state)
    return { accepted: true }
  }
  const post = (kind: 'register' | 'report' | 'ack'): Route => ({ role: 'editor', maxBody: 16384, handle: (request, ctx) => catchRequestErrors(async () => {
    if (request.method !== 'POST') return problemResponse(405, 'POST')
    const value: unknown = await request.json().catch(() => undefined); budget(value)
    if (kind === 'register') { if (!validateAuthoringClientOpen(value)) throw new RequestError(400, 'client-open-invalid'); return jsonResponse(register(ctx.document, value, ctx.member)) }
    if (!isRecord(value) || Object.keys(value).some(key => !['connection', 'report'].includes(key)) || !validateAuthoringClientLease(value.connection)) throw new RequestError(400, 'client-connection-invalid')
    if (kind === 'ack') { if (!validateAuthoringClientAcknowledgement(value.report)) throw new RequestError(400, 'client-ack-invalid'); return jsonResponse(acknowledge(ctx.document, value.connection, value.report, ctx.member)) }
    if (!validateAuthoringClientReport(value.report)) throw new RequestError(400, 'client-report-invalid')
    report(connection(ctx.document, value.connection, ctx.member), value.report, digest(value.report)); return jsonResponse({ accepted: true })
  }) })
  return { service, routes: {
    'authoring-clients/register': post('register'), 'authoring-clients/report': post('report'), 'authoring-clients/ack': post('ack'),
    'authoring-clients/events': { role: 'editor', handle: (request, ctx) => catchRequestErrors(async () => {
      if (request.method !== 'GET') return problemResponse(405, 'GET')
      const query = new URL(request.url).searchParams, lease = { clientId: query.get('clientId'), epoch: query.get('epoch'), connectionId: query.get('connectionId'), credential: request.headers.get('X-Presmium-Authoring-Client') }
      if (!validateAuthoringClientLease(lease)) throw new RequestError(400, 'client-connection-invalid')
      return sseResponse(open(ctx.document, lease, ctx.member, request.signal), request.signal)
    }) } satisfies Route,
  }, async close() { closed = true; for (const client of clients.values()) client.close?.(); for (const pending of requests.values()) clearTimeout(pending.timer); requests.clear(); clients.clear() } }
}
