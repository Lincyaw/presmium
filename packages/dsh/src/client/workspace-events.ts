import { WebSocket } from 'partysocket'
import type { WorkspaceSubscription } from '@lincyaw/workbench'
import type { AuthoringClientAcknowledgement, AuthoringClientEvent, AuthoringClientReport } from '@lincyaw/kernel'
import { AUTHORING_CLIENT_REQUEST_TIMEOUT_MS } from '@lincyaw/kernel'
import { WORKSPACE_EVENTS_PATH, workspaceEventMessage } from '../workspace-events.ts'
import type { WorkspaceEventTopic, WorkspaceEventCommand } from '../workspace-events.ts'

const TOPICS: Readonly<Record<string, WorkspaceEventTopic>> = {
  document: 'document', diagnostics: 'diagnostics', review: 'review', revision: 'ir', job: 'jobs', 'viewer-site': 'viewer-site', 'viewer-control': 'viewer-control', approvals: 'approvals',
}

/** Each live reader owns one logical subscription; the library owns physical reconnect timing. */
export function workspaceSubscriptions(ctx: Pick<DshClientContext, 'effect'>): WorkspaceSubscription {
  type Subscription = { id?: string, request: Extract<WorkspaceEventCommand, { type: 'subscribe' }>, received(data: string, event?: string): void, failed?(): void, ready?(): void, pending?: Map<number, { resolve(): void, reject(error: Error): void, timer: ReturnType<typeof setTimeout> }> }
  const readers = new Set<Subscription>()
  const ids = new Map<string, Subscription>()
  const url = new URL(WORKSPACE_EVENTS_PATH.slice(1), document.baseURI)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  const socket = new WebSocket(url.href, [], { startClosed: true, maxEnqueuedMessages: 0 })
  let closed = false
  let serial = 0
  const subscribe = (reader: Subscription) => {
    const id = String(++serial)
    reader.id = id
    ids.set(id, reader)
    socket.send(JSON.stringify({ ...reader.request, id }))
  }
  const opened = () => {
    if (closed) return
    ids.clear()
    for (const reader of readers) subscribe(reader)
  }
  const disconnected = () => {
    ids.clear()
    for (const reader of readers) { reader.id = undefined; rejectPublications(reader); reader.failed?.() }
  }
  const rejectPublications = (reader: Subscription) => { for (const pending of reader.pending?.values() ?? []) { clearTimeout(pending.timer); pending.reject(new Error('client-transport-disconnected')) }; reader.pending?.clear() }
  const message = (event: MessageEvent) => {
    let raw: unknown
    try { raw = JSON.parse(event.data) } catch { return }
    const parsed = workspaceEventMessage.safeParse(raw)
    if (!parsed.success) return
    const value = parsed.data
    const reader = ids.get(value.id)
    if (!reader || !readers.has(reader)) return
    if (value.type === 'published') {
      const pending = reader.pending?.get(value.sequence)
      reader.pending?.delete(value.sequence)
      if (pending) clearTimeout(pending.timer)
      if (value.ok) pending?.resolve(); else pending?.reject(new Error('client-publication-refused'))
    } else if (value.type === 'ready') reader.ready?.()
    else if (value.type === 'error') { rejectPublications(reader); reader.failed?.() }
    else {
      const topic = reader.request.topic
      const named = topic === 'viewer-site' ? ['ir', 'reload'] : topic === 'viewer-control' ? ['ready', 'approval', 'settled', 'go', 'session'] : topic === 'approvals' ? ['approval', 'settled'] : undefined
      if (named && (!value.event || !named.includes(value.event))) return
      reader.received(value.data, value.event)
    }
  }
  socket.addEventListener('open', opened)
  socket.addEventListener('close', disconnected)
  socket.addEventListener('message', message)
  ctx.effect(() => () => {
    closed = true
    for (const reader of readers) rejectPublications(reader)
    readers.clear(); ids.clear()
    socket.removeEventListener('open', opened)
    socket.removeEventListener('close', disconnected)
    socket.removeEventListener('message', message)
    socket.close()
  }, 'presmium: workspace subscriptions')
  const add = (reader: Subscription) => {
    if (!closed) {
      readers.add(reader)
      if (socket.readyState === WebSocket.OPEN) subscribe(reader)
      else if (readers.size === 1) socket.reconnect()
    }
    return () => {
      if (!readers.delete(reader)) return
      rejectPublications(reader)
      if (reader.id) {
        ids.delete(reader.id)
        if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'unsubscribe', id: reader.id }))
      }
      if (readers.size === 0) socket.close()
    }
  }
  const subscription: WorkspaceSubscription = (address, name, received, failed, ready) => {
    const topic = TOPICS[name]
    const query = new URL(address).searchParams
    const document = query.get('document')
    if (!topic || topic === 'authoring-client' || document === null) throw new Error('Invalid workspace event subscription.')
    const request: Subscription['request'] = topic === 'viewer-site'
      ? { type: 'subscribe', id: '', topic, document, app: query.get('app') ?? '', lang: query.get('lang') ?? '', form: query.get('form') === 'slides' ? 'slides' : 'web' }
      : topic === 'viewer-control' ? { type: 'subscribe', id: '', topic, document, window: query.get('window') ?? '' }
        : { type: 'subscribe', id: '', topic, document }
    const reader: Subscription = { request, received, failed, ready }
    return add(reader)
  }
  subscription.openAuthoringClient = (document, open, received, failed) => {
    const reader: Subscription = { request: { type: 'subscribe', id: '', topic: 'authoring-client', document, ...open }, pending: new Map(), failed,
      received(raw) { let event: AuthoringClientEvent; try { event = JSON.parse(raw) } catch { return }; if (event.type === 'connected') rejectPublications(reader); received(event) } }
    const close = add(reader)
    const publish = (kind: 'state' | 'ack', connectionId: string, report: AuthoringClientReport | AuthoringClientAcknowledgement) => new Promise<void>((resolve, reject) => {
      if (closed || !readers.has(reader) || !reader.id || socket.readyState !== WebSocket.OPEN || reader.pending!.has(report.sequence)) { reject(new Error('client-transport-disconnected')); return }
      // A lost publication receipt must release the queue without authorizing a repeated action.
      const timer = setTimeout(() => { reader.pending!.delete(report.sequence); reject(new Error('client-publication-timeout')) }, AUTHORING_CLIENT_REQUEST_TIMEOUT_MS / 2)
      reader.pending!.set(report.sequence, { resolve, reject, timer })
      socket.send(JSON.stringify({ type: 'authoring-client-publish', id: reader.id, connectionId, sequence: report.sequence, kind, value: report }))
    })
    return { close, publish: (connectionId, report) => publish('state', connectionId, report), acknowledge: (connectionId, report) => publish('ack', connectionId, report) }
  }
  return subscription
}
