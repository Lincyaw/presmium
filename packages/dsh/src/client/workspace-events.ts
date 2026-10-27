import { WebSocket } from 'partysocket'
import type { WorkspaceSubscription } from '@lincyaw/workbench'
import { WORKSPACE_EVENTS_PATH, workspaceEventMessage } from '../workspace-events.ts'
import type { WorkspaceEventTopic } from '../workspace-events.ts'

const TOPICS: Readonly<Record<string, WorkspaceEventTopic>> = {
  document: 'document', diagnostics: 'diagnostics', review: 'review', revision: 'ir', job: 'jobs',
}

/** Each live reader owns one logical subscription; the library owns physical reconnect timing. */
export function workspaceSubscriptions(ctx: Pick<DshClientContext, 'effect'>): WorkspaceSubscription {
  type Subscription = { id?: string, topic: WorkspaceEventTopic, document: string, received(data: string): void, failed?(): void, ready?(): void }
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
    socket.send(JSON.stringify({ type: 'subscribe', id, topic: reader.topic, document: reader.document }))
  }
  const opened = () => {
    if (closed) return
    ids.clear()
    for (const reader of readers) subscribe(reader)
  }
  const disconnected = () => {
    ids.clear()
    for (const reader of readers) { reader.id = undefined; reader.failed?.() }
  }
  const message = (event: MessageEvent) => {
    let raw: unknown
    try { raw = JSON.parse(event.data) } catch { return }
    const parsed = workspaceEventMessage.safeParse(raw)
    if (!parsed.success) return
    const value = parsed.data
    const reader = ids.get(value.id)
    if (!reader || !readers.has(reader)) return
    if (value.type === 'ready') reader.ready?.()
    else if (value.type === 'error') reader.failed?.()
    else reader.received(value.data)
  }
  socket.addEventListener('open', opened)
  socket.addEventListener('close', disconnected)
  socket.addEventListener('message', message)
  ctx.effect(() => () => {
    closed = true
    readers.clear(); ids.clear()
    socket.removeEventListener('open', opened)
    socket.removeEventListener('close', disconnected)
    socket.removeEventListener('message', message)
    socket.close()
  }, 'presmium: workspace subscriptions')
  return (address, name, received, failed, ready) => {
    const topic = TOPICS[name]
    const document = new URL(address).searchParams.get('document')
    if (!topic || document === null) throw new Error('Invalid workspace event subscription.')
    const reader: Subscription = { topic, document, received, failed, ready }
    if (!closed) {
      readers.add(reader)
      if (socket.readyState === WebSocket.OPEN) subscribe(reader)
      else if (readers.size === 1) socket.reconnect()
    }
    return () => {
      if (!readers.delete(reader)) return
      if (reader.id) {
        ids.delete(reader.id)
        if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'unsubscribe', id: reader.id }))
      }
      if (readers.size === 0) socket.close()
    }
  }
}
