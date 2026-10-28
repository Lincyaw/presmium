import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import { EventSource } from 'eventsource'
import { WebSocketServer, WebSocket } from 'ws'
import { AUTHORING_CLIENT_EVENT_MAX_BYTES } from '@lincyaw/kernel'
import type { AuthoringClientLease, AuthoringClientEvent } from '@lincyaw/kernel'
import { validateAuthoringClientLease } from '@lincyaw/kernel/node'
import type { DshContext } from './dsh-types.ts'
import { SERVER_ROUTES, WORKSPACE_ROUTES } from './server-routes.ts'
import { WORKSPACE_EVENTS_PATH, workspaceEventCommand } from '../workspace-events.ts'
import type { WorkspaceEventMessage } from '../workspace-events.ts'

export const name = 'presmium-events'
export const inject = ['presmium', 'connection', 'webServer']

/** The documented WebServer upgrade and Connection admission faces. */
interface EventContext extends DshContext {
  webServer: { registerUpgrade(route: { path: string, handler(request: IncomingMessage, socket: Duplex, head: Buffer): void }): () => void }
  connection: DshContext['connection'] & {
    admit(request: IncomingMessage): { rejection: 401 | 403 } | { peer: { principal: { kind: string }, signal: AbortSignal } }
  }
}

const ROUTES = {
  document: { path: `${WORKSPACE_ROUTES}document/events`, event: 'document' },
  diagnostics: { path: `${SERVER_ROUTES}diagnostics/events`, event: 'diagnostics' },
  review: { path: `${WORKSPACE_ROUTES}review`, event: 'review' },
  ir: { path: `${WORKSPACE_ROUTES}ir/events`, event: 'revision' },
  jobs: { path: `${WORKSPACE_ROUTES}jobs/events`, event: 'job' },
} as const
const MAX_SUBSCRIPTIONS = 16
const MAX_BUFFERED_BYTES = 2 << 20

/** Borrow the framework listener and trust fence; never take ownership of their server or Peer. */
export function apply(ctx: EventContext): void {
  const server = new WebSocketServer({ noServer: true, maxPayload: AUTHORING_CLIENT_EVENT_MAX_BYTES, perMessageDeflate: false })
  const sockets = new Map<WebSocket, () => void>()
  const unregister = ctx.webServer.registerUpgrade({
    path: WORKSPACE_EVENTS_PATH,
    handler(request, socket, head) {
      const admission = ctx.connection.admit(request)
      const rejected = 'rejection' in admission ? admission.rejection : admission.peer.principal.kind === 'owner' ? undefined : 403
      if (rejected !== undefined) {
        socket.end(`HTTP/1.1 ${rejected} Rejected\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`)
        return
      }
      if (!('peer' in admission) || admission.peer.signal.aborted) { socket.destroy(); return }
      const peer = admission.peer
      server.handleUpgrade(request, socket, head, ws => {
        const subscriptions = new Map<string, { stop(): void, publish?(command: Extract<import('../workspace-events.ts').WorkspaceEventCommand, { type: 'authoring-client-publish' }>): Promise<void> }>()
        let closed = false
        const cleanup = () => {
          if (closed) return
          closed = true
          peer.signal.removeEventListener('abort', revoked)
          for (const entry of subscriptions.values()) entry.stop()
          subscriptions.clear()
        }
        const revoked = () => { cleanup(); ws.terminate() }
        const send = (message: WorkspaceEventMessage) => {
          if (closed || ws.readyState !== WebSocket.OPEN) return
          const payload = JSON.stringify(message)
          if (ws.bufferedAmount + Buffer.byteLength(payload) > MAX_BUFFERED_BYTES) { cleanup(); ws.close(1013, 'Workspace event consumer is too slow'); return }
          ws.send(payload, error => { if (error) revoked() })
        }
        sockets.set(ws, cleanup)
        peer.signal.addEventListener('abort', revoked, { once: true })
        if (peer.signal.aborted) { revoked(); return }
        ws.on('close', () => { cleanup(); sockets.delete(ws) })
        ws.on('error', revoked)
        ws.on('message', (data, binary) => {
          let raw: unknown
          try { raw = binary ? undefined : JSON.parse(data.toString()) } catch { raw = undefined }
          const parsed = workspaceEventCommand.safeParse(raw)
          if (!parsed.success) { cleanup(); ws.close(1008, 'Invalid workspace subscription'); return }
          const command = parsed.data
          if (command.type === 'unsubscribe') {
            subscriptions.get(command.id)?.stop()
            subscriptions.delete(command.id)
            return
          }
          if (command.type === 'authoring-client-publish') {
            const entry = subscriptions.get(command.id)
            void (entry?.publish ? entry.publish(command) : Promise.reject()).then(() => {
              if (subscriptions.get(command.id) === entry) send({ type: 'published', id: command.id, sequence: command.sequence, ok: true })
            }, () => { if (subscriptions.get(command.id) === entry) send({ type: 'published', id: command.id, sequence: command.sequence, ok: false }) })
            return
          }
          if (subscriptions.has(command.id) || subscriptions.size >= MAX_SUBSCRIPTIONS) { cleanup(); ws.close(1008, 'Workspace subscription limit'); return }
          const controller = new AbortController()
          let source: EventSource | undefined
          const entry: { stop(): void, publish?(command: Extract<import('../workspace-events.ts').WorkspaceEventCommand, { type: 'authoring-client-publish' }>): Promise<void> } = { stop: () => { controller.abort(); source?.close() } }
          subscriptions.set(command.id, entry)
          const current = () => !closed && !controller.signal.aborted && subscriptions.get(command.id) === entry
          void ctx.presmium.server.ready.then(endpoint => {
            if (!current()) return
            if (command.topic === 'authoring-client') {
              // Keep the client credential on the trusted host, off browser messages and MCP reads.
              let lease: AuthoringClientLease | undefined
              let publication: Promise<void> = Promise.resolve()
              let publications = 0
              const post = async (kind: string, value: unknown) => {
                const path = `${WORKSPACE_ROUTES}authoring-clients/${kind}?${new URLSearchParams({ document: command.document })}`
                const response = await ctx.presmium.server.request(path, { method: 'POST', body: value, signal: controller.signal })
                if (!response.ok) throw new Error('client-publication-refused')
                return response.json() as Promise<unknown>
              }
              entry.publish = value => {
                if (publications >= 8) return Promise.reject(new Error('client-publication-limit'))
                publications++
                const next = publication.then(async () => {
                  if (!current() || !lease || value.connectionId !== lease.connectionId || !value.value || typeof value.value !== 'object'
                    || !('sequence' in value.value) || value.value.sequence !== value.sequence) throw new Error('client-connection-changed')
                  await post(value.kind === 'ack' ? 'ack' : 'report', { connection: lease, report: value.value })
                }).finally(() => { publications-- })
                publication = next.catch(() => {})
                return next
              }
              void post('register', { clientId: command.clientId, epoch: command.epoch, snapshot: command.snapshot }).then(value => {
                if (!current()) return
                if (!validateAuthoringClientLease(value)) throw new Error('client-registration-invalid')
                lease = value
                const query = new URLSearchParams({ document: command.document, clientId: lease.clientId, epoch: lease.epoch, connectionId: lease.connectionId })
                const path = `${WORKSPACE_ROUTES}authoring-clients/events?${query}`
                source = new EventSource(new URL(path, endpoint.url), {
                  fetch: (_address, init) => ctx.presmium.server.request(path, { headers: { ...Object.fromEntries(new Headers(init?.headers)), 'X-Presmium-Authoring-Client': value.credential }, signal: init?.signal ? AbortSignal.any([controller.signal, init.signal]) : controller.signal }),
                })
                source.addEventListener('error', () => { if (current()) send({ id: command.id, type: 'error' }) })
                source.addEventListener('authoring-client', event => {
                  if (!current()) return
                  let data: AuthoringClientEvent
                  try { data = JSON.parse(event.data) } catch { return }
                  if (data.type === 'connected' && lease) lease = { ...lease, connectionId: data.connectionId }
                  send({ id: command.id, type: 'event', data: event.data })
                })
              }).catch(() => { if (current()) send({ id: command.id, type: 'error' }) })
              return
            }
            const route = command.topic === 'viewer-site' ? { path: '/__app/events', events: ['ir', 'reload'] }
              : command.topic === 'viewer-control' ? { path: `${SERVER_ROUTES}control`, events: ['ready', 'approval', 'settled', 'go', 'session'] }
                : { path: ROUTES[command.topic].path, events: [ROUTES[command.topic].event] }
            const query = new URLSearchParams({ document: command.document })
            if (command.topic === 'viewer-site') { query.set('app', command.app); query.set('lang', command.lang); query.set('form', command.form) }
            if (command.topic === 'viewer-control') query.set('window', command.window)
            const path = `${route.path}?${query}`
            source = new EventSource(new URL(path, endpoint.url), {
              fetch: (_address, init) => ctx.presmium.server.request(path, {
                headers: Object.fromEntries(new Headers(init?.headers)),
                signal: init?.signal ? AbortSignal.any([controller.signal, init.signal]) : controller.signal,
              }),
            })
            source.addEventListener('open', () => { if (current()) send({ id: command.id, type: 'ready' }) })
            source.addEventListener('error', () => { if (current()) send({ id: command.id, type: 'error' }) })
            for (const name of route.events) source.addEventListener(name, event => { if (current()) send({ id: command.id, type: 'event', ...command.topic === 'viewer-site' || command.topic === 'viewer-control' ? { event: name } : {}, data: event.data }) })
          }).catch(() => { if (current()) send({ id: command.id, type: 'error' }) })
        })
      })
    },
  })
  ctx.effect(() => () => {
    unregister()
    for (const [socket, cleanup] of sockets) { cleanup(); socket.terminate() }
    server.close()
  })
}
