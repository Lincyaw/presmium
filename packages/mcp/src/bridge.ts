import { StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { ReadBuffer, serializeMessage } from '@modelcontextprotocol/server'
import type { JSONRPCMessage } from '@modelcontextprotocol/server'
import { errorMessage, isRecord } from '@lincyaw/kernel'

/** Address/token are persistent; pid distinguishes a new service at the same address. */
export interface BridgeTarget { mcp: string, token: string, pid?: number }
export interface BridgeConnection { transport: StreamableHTTPClientTransport, close(): Promise<void> }
export interface BridgeOptions {
  locate(): BridgeTarget | undefined
  /** Used only before the first workspace connection; never a retry destination. */
  fallback?(): BridgeConnection
  unreachable: string
  invalidRequest?: string
  log(message: string): void
  connected?(target: BridgeTarget): void
  input?: NodeJS.ReadableStream
  output?: NodeJS.WritableStream
}
type Id = string | number
type RequestMessage = JSONRPCMessage & { id: Id, method: string }
const isRequest = (message: JSONRPCMessage): message is RequestMessage => 'method' in message && 'id' in message
const isResponse = (message: JSONRPCMessage): message is JSONRPCMessage & { id: Id } => !('method' in message) && 'id' in message
interface Connection extends BridgeConnection { target?: BridgeTarget, pending: Set<Id>, serverRequests: Set<string>, retired: boolean, closed: boolean }
interface Pending {
  id: Id, wireId: string, connection?: Connection, method: string, controller: AbortController
  listen?: { message: RequestMessage, acknowledged: boolean, notifications: Record<string, unknown> }
}
const SUBSCRIPTION_ID = 'io.modelcontextprotocol/subscriptionId'

/** One stdio lifetime, with each request owned by exactly one backend and never automatically replayed. */
export async function bridgeStdio(first: BridgeTarget | undefined, options: BridgeOptions): Promise<void> {
  const input = options.input ?? process.stdin, output = options.output ?? process.stdout
  const pending = new Map<Id, Pending>(), exchanges = new Map<Id, Pending>()
  const serverRequests = new Map<string, { connection: Connection, id: Id }>(), connections = new Set<Connection>()
  let current: Connection, protocolVersion: string | undefined, ready = false, closed = false, serial = 0
  let switching: Promise<Connection> | undefined
  const write = (message: JSONRPCMessage) => { if (!closed) output.write(serializeMessage(message)) }
  const unavailable = (id: Id) => write({ jsonrpc: '2.0', id, error: { code: -32000, message: options.unreachable } })
  const changed = () => {
    if (!ready || closed) return
    if (protocolVersion) {
      write({ jsonrpc: '2.0', method: 'notifications/tools/list_changed' })
      write({ jsonrpc: '2.0', method: 'notifications/resources/list_changed' })
    } else for (const operation of pending.values()) {
      if (!operation.listen?.acknowledged) continue
      const params = { _meta: { [SUBSCRIPTION_ID]: String(operation.id) } }
      if (operation.listen.notifications.toolsListChanged) write({ jsonrpc: '2.0', method: 'notifications/tools/list_changed', params })
      if (operation.listen.notifications.resourcesListChanged) write({ jsonrpc: '2.0', method: 'notifications/resources/list_changed', params })
    }
  }
  const forget = (operation: Pending, wireId = operation.wireId) => {
    exchanges.delete(wireId); operation.connection?.pending.delete(wireId)
    if (pending.get(operation.id) === operation && operation.wireId === wireId) pending.delete(operation.id)
  }
  const detachListener = (operation: Pending, wireId: Id) => {
    if (closed || !operation.listen?.acknowledged || operation.wireId !== wireId) return false
    exchanges.delete(wireId); operation.connection?.pending.delete(wireId)
    operation.connection = undefined; operation.controller.abort()
    return true
  }
  const close = async (connection: Connection) => {
    if (connection.closed) return
    connection.closed = true
    connections.delete(connection)
    for (const id of connection.pending) {
      const operation = exchanges.get(id)
      if (operation?.connection !== connection) continue
      if (detachListener(operation, id)) continue
      forget(operation); operation.controller.abort(); unavailable(operation.id)
    }
    connection.pending.clear()
    for (const id of connection.serverRequests) {
      serverRequests.delete(id)
      write({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: id } })
    }
    connection.serverRequests.clear()
    await connection.close().catch(error => options.log(errorMessage(error)))
  }
  const retire = (connection: Connection) => {
    if (connection.retired && connection.pending.size === 0 && connection.serverRequests.size === 0) void close(connection)
  }
  const open = async (target?: BridgeTarget): Promise<Connection> => {
    const backend = target ? (() => {
      const transport = new StreamableHTTPClientTransport(new URL(target.mcp), { requestInit: { headers: { Authorization: `Bearer ${target.token}` } } })
      return { transport, close: () => transport.close() }
    })() : options.fallback?.()
    if (!backend) throw new Error(options.unreachable)
    const connection: Connection = { ...backend, target, pending: new Set(), serverRequests: new Set(), retired: false, closed: false }
    connections.add(connection)
    const transport = connection.transport
    transport.onmessage = message => {
      if (closed || connection.closed) return
      if (isResponse(message)) {
        const operation = exchanges.get(message.id)
        if (operation?.connection !== connection) return
        // The upstream may end its stream during a graceful restart; the stdio subscription still belongs to its client.
        if (operation.listen?.acknowledged && 'result' in message && isRecord(message.result) && message.result.resultType === 'complete' && detachListener(operation, message.id)) {
          retire(connection)
          return
        }
        forget(operation)
        const handshake = operation.method === 'initialize' || operation.method === 'server/discover'
        if (handshake && 'result' in message) {
          ready = true
          if (operation.method === 'initialize' && isRecord(message.result) && typeof message.result.protocolVersion === 'string') {
            protocolVersion = message.result.protocolVersion
            for (const active of connections) active.transport.setProtocolVersion(protocolVersion)
          }
        }
        write({ ...message, id: operation.id })
        if (handshake && connection !== current) changed()
        retire(connection)
        return
      }
      if ('method' in message && isRecord(message.params) && isRecord(message.params._meta) && typeof message.params._meta[SUBSCRIPTION_ID] === 'string') {
        const operation = exchanges.get(String(message.params._meta[SUBSCRIPTION_ID]))
        if (!operation?.listen || operation.connection !== connection) return
        if (message.method === 'notifications/subscriptions/acknowledged') {
          // A modern stdio client may discover on a disposable probe and send no handshake here.
          ready = true
          const already = operation.listen.acknowledged
          operation.listen.acknowledged = true
          operation.listen.notifications = isRecord(message.params.notifications) ? message.params.notifications : {}
          if (already) return
        }
        write({ ...message, params: { ...message.params, _meta: { ...message.params._meta, [SUBSCRIPTION_ID]: String(operation.id) } } })
        return
      }
      if (isRequest(message)) {
        const id = `presmium-bridge-${++serial}`
        serverRequests.set(id, { connection, id: message.id }); connection.serverRequests.add(id)
        write({ ...message, id })
        return
      }
      if ('method' in message && message.method === 'notifications/cancelled' && isRecord(message.params)) {
        for (const [id, request] of serverRequests) if (request.connection === connection && request.id === message.params.requestId) {
          serverRequests.delete(id); connection.serverRequests.delete(id)
          write({ ...message, params: { ...message.params, requestId: id } }); retire(connection)
          return
        }
      }
      if (connection === current || (connection.pending.size > 0 && 'method' in message && message.method === 'notifications/progress')) write(message)
    }
    transport.onerror = error => { if (!closed && !connection.closed) options.log(errorMessage(error)) }
    transport.onclose = () => { if (!connection.closed) void close(connection) }
    try {
      await transport.start()
      if (protocolVersion) transport.setProtocolVersion(protocolVersion)
      return connection
    } catch (error) { await close(connection); throw error }
  }
  const refresh = (): Promise<Connection> => {
    if (closed) return Promise.resolve(current)
    if (switching) return switching
    switching = (async () => {
      const target = options.locate(), before = current
      if (!target) return before
      if (!before.closed && before.target?.mcp === target.mcp && before.target?.token === target.token && before.target?.pid === target.pid) {
        resumeListeners(before)
        return before
      }
      const next = await open(target)
      if (closed) { await close(next); return before }
      current = next; before.retired = true; retire(before)
      // Only readonly notification streams follow the service; business requests retain their original backend.
      resumeListeners(next)
      options.connected?.(target); changed()
      return next
    })().finally(() => { switching = undefined })
    return switching
  }
  const send = async (connection: Connection, message: JSONRPCMessage, operation?: Pending) => {
    const wireId = operation?.wireId, controller = operation?.controller
    try { await connection.transport.send(message, controller ? { requestSignal: controller.signal } : undefined) }
    catch (error) {
      if (!closed && !connection.closed && !controller?.signal.aborted) options.log(errorMessage(error))
      if (operation && wireId !== undefined && exchanges.get(wireId) === operation) {
        if (detachListener(operation, wireId)) { retire(connection); return }
        forget(operation, wireId)
        if (!controller?.signal.aborted) unavailable(operation.id)
      }
      retire(connection)
    }
  }
  const resumeListeners = (next: Connection) => {
    for (const operation of pending.values()) if (operation.listen && (operation.connection || operation.listen.acknowledged) && operation.connection !== next) {
      const previous = operation.connection, controller = operation.controller
      exchanges.delete(operation.wireId); previous?.pending.delete(operation.wireId)
      operation.wireId = `presmium-request-${++serial}`; operation.controller = new AbortController(); operation.connection = next
      exchanges.set(operation.wireId, operation); next.pending.add(operation.wireId)
      controller.abort()
      if (previous) retire(previous)
      void send(next, { ...operation.listen.message, id: operation.wireId }, operation)
    }
  }
  const deliver = async (message: JSONRPCMessage) => {
    if (closed) return
    if (isResponse(message)) {
      const request = serverRequests.get(String(message.id))
      if (!request) return
      serverRequests.delete(String(message.id)); request.connection.serverRequests.delete(String(message.id))
      try { await request.connection.transport.send({ ...message, id: request.id }) }
      catch (error) { options.log(errorMessage(error)) }
      finally { retire(request.connection) }
      return
    }
    if ('method' in message && message.method === 'notifications/cancelled' && isRecord(message.params)) {
      const id = message.params.requestId
      if (typeof id === 'string' || typeof id === 'number') {
        const operation = pending.get(id)
        if (operation) {
          forget(operation); operation.controller.abort()
          if (operation.connection) retire(operation.connection)
        }
      }
      return
    }
    let operation: Pending | undefined
    if (isRequest(message)) {
      if (pending.has(message.id)) {
        write({ jsonrpc: '2.0', id: message.id, error: { code: -32600, message: options.invalidRequest ?? options.unreachable } })
        return
      }
      operation = { id: message.id, wireId: `presmium-request-${++serial}`, method: message.method, controller: new AbortController(),
        ...message.method === 'subscriptions/listen' ? { listen: { message, acknowledged: false, notifications: {} } } : {} }
      pending.set(message.id, operation); exchanges.set(operation.wireId, operation)
    }
    let connection: Connection | undefined
    try {
      connection = await refresh()
      if (closed || operation?.controller.signal.aborted) return
      if (operation) { operation.connection = connection; connection.pending.add(operation.wireId) }
      await send(connection, operation ? { ...message, id: operation.wireId } as JSONRPCMessage : message, operation)
    }
    catch (error) {
      if (!closed && !connection?.closed && !operation?.controller.signal.aborted) options.log(errorMessage(error))
      if (operation && pending.get(operation.id) === operation) { forget(operation); unavailable(operation.id) }
      if (connection) retire(connection)
    }
  }

  current = await open(first)
  const detector = setInterval(() => { void refresh().catch(error => options.log(errorMessage(error))) }, 1000)
  detector.unref()
  let buffer = new ReadBuffer()
  const receive = (chunk: Buffer) => {
    try {
      buffer.append(chunk)
      for (let message = buffer.readMessage(); message !== null; message = buffer.readMessage()) void deliver(message).catch(error => options.log(errorMessage(error)))
    } catch (error) { buffer = new ReadBuffer(); options.log(errorMessage(error)) }
  }
  input.on('data', receive)
  await new Promise<void>(done => {
    const end = () => {
      if (closed) return
      closed = true; clearInterval(detector); input.off('data', receive); input.off('end', end); input.off('close', end)
      for (const operation of pending.values()) operation.controller.abort()
      void (async () => {
        await switching?.catch(() => undefined)
        await Promise.allSettled([...connections].map(close))
        pending.clear(); exchanges.clear(); serverRequests.clear(); done()
      })()
    }
    input.once('end', end); input.once('close', end)
  })
}
