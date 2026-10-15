/**
 * The classroom server: a y-websocket room server. Each room (the URL path,
 * e.g. `ws://host:1234/<room>`) is one shared Yjs document that the session
 * plugin's clients (y-websocket providers) sync with, plus their awareness
 * (who is connected). Rooms stay in memory while the server runs, so a
 * classroom survives reconnects and a late joiner gets its whole state.
 *
 * It speaks the y-websocket protocol through `y-protocols`, the building
 * blocks of y-websocket itself.
 */
import { createServer } from 'node:http'
import type { IncomingMessage } from 'node:http'
import type { AddressInfo } from 'node:net'
import * as decoding from 'lib0/decoding'
import * as encoding from 'lib0/encoding'
import { WebSocket, WebSocketServer } from 'ws'
import * as awarenessProtocol from 'y-protocols/awareness'
import * as syncProtocol from 'y-protocols/sync'
import * as Y from 'yjs'

const MESSAGE_SYNC = 0
const MESSAGE_AWARENESS = 1
const PING_INTERVAL = 30_000
/** Room names: letters, digits, `-`, `_` and `.`, as the session plugin generates them. */
const ROOM = /^[\w.-]{1,128}$/

class Room extends Y.Doc {
  /** Connections, each with the awareness client ids it controls. */
  readonly conns = new Map<WebSocket, Set<number>>()
  readonly awareness = new awarenessProtocol.Awareness(this)

  constructor() {
    super({ gc: true })
    this.awareness.setLocalState(null)
    this.on('update', (update: Uint8Array) => {
      const encoder = encoding.createEncoder()
      encoding.writeVarUint(encoder, MESSAGE_SYNC)
      syncProtocol.writeUpdate(encoder, update)
      this.broadcast(encoding.toUint8Array(encoder))
    })
    this.awareness.on('update', ({ added, updated, removed }: Record<'added' | 'updated' | 'removed', number[]>, conn: WebSocket | null) => {
      const changed = [...added, ...updated, ...removed]
      const controlled = conn && this.conns.get(conn)
      if (controlled) {
        added.forEach(id => controlled.add(id))
        removed.forEach(id => controlled.delete(id))
      }
      this.broadcast(awarenessMessage(this.awareness, changed))
    })
  }

  broadcast(message: Uint8Array): void {
    for (const conn of this.conns.keys()) send(conn, message)
  }
}

function awarenessMessage(awareness: awarenessProtocol.Awareness, clients: number[]): Uint8Array {
  const encoder = encoding.createEncoder()
  encoding.writeVarUint(encoder, MESSAGE_AWARENESS)
  encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(awareness, clients))
  return encoding.toUint8Array(encoder)
}

function send(conn: WebSocket, message: Uint8Array): void {
  if (conn.readyState !== WebSocket.OPEN) return
  conn.send(message, error => error && conn.close())
}

/** The room of a request: its URL path, e.g. `/<room>?…`; undefined when that is no room name. */
function roomName(url = '/'): string | undefined {
  // Room names need no percent-encoding, so the path is not decoded.
  const name = url.slice(1).split('?')[0]!
  return ROOM.test(name) ? name : undefined
}

function handle(room: Room, conn: WebSocket, data: Uint8Array): void {
  const decoder = decoding.createDecoder(data)
  const type = decoding.readVarUint(decoder)
  if (type === MESSAGE_SYNC) {
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, MESSAGE_SYNC)
    syncProtocol.readSyncMessage(decoder, encoder, room, conn)
    // Only sync step 1 has an answer (step 2); updates have none.
    if (encoding.length(encoder) > 1) send(conn, encoding.toUint8Array(encoder))
  } else if (type === MESSAGE_AWARENESS) {
    awarenessProtocol.applyAwarenessUpdate(room.awareness, decoding.readVarUint8Array(decoder), conn)
  }
}

export interface ClassroomServerOptions {
  /** 0 picks a free port. Default 1234, as y-websocket. */
  port?: number
  /** Default: every interface, so learners on the local network can join. */
  host?: string
}

export interface ClassroomServer {
  readonly port: number
  /** WebSocket URL of the server on this machine, e.g. `ws://localhost:1234`. */
  readonly url: string
  close(): Promise<void>
}

export async function startClassroomServer(options: ClassroomServerOptions = {}): Promise<ClassroomServer> {
  const rooms = new Map<string, Room>()
  const http = createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/plain' })
    response.end('presmium classroom server\n')
  })
  const wss = new WebSocketServer({ noServer: true })

  function connect(conn: WebSocket, request: IncomingMessage): void {
    // Invalid frames from a client end its connection; without a listener they would end the process.
    conn.on('error', error => console.error('[classroom] connection error:', error.message))
    const name = roomName(request.url)
    if (!name) {
      conn.close(1008, 'invalid room name')
      return
    }
    let room = rooms.get(name)
    if (!room) rooms.set(name, room = new Room())
    const current = room
    current.conns.set(conn, new Set())
    conn.binaryType = 'arraybuffer'
    conn.on('message', (data: ArrayBuffer) => {
      try {
        handle(current, conn, new Uint8Array(data))
      } catch (error) {
        console.error(`[classroom] room ${name}: bad message`, error)
      }
    })
    let alive = true
    conn.on('pong', () => alive = true)
    // A connection that stops answering pings is closed, so its participant leaves the room.
    const ping = setInterval(() => {
      if (!alive || conn.readyState !== WebSocket.OPEN) {
        conn.terminate()
        return
      }
      alive = false
      conn.ping()
    }, PING_INTERVAL)
    conn.on('close', () => {
      clearInterval(ping)
      const controlled = current.conns.get(conn)
      current.conns.delete(conn)
      if (controlled?.size) awarenessProtocol.removeAwarenessStates(current.awareness, [...controlled], null)
      if (current.conns.size === 0 && current.store.clients.size === 0 && rooms.get(name) === current) {
        rooms.delete(name)
        current.destroy()
      }
    })
    // Sync step 1 and the current awareness, as y-websocket servers greet a client.
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, MESSAGE_SYNC)
    syncProtocol.writeSyncStep1(encoder, current)
    send(conn, encoding.toUint8Array(encoder))
    const states = [...current.awareness.getStates().keys()]
    if (states.length > 0) send(conn, awarenessMessage(current.awareness, states))
  }

  wss.on('connection', (conn: WebSocket, request: IncomingMessage) => {
    try {
      connect(conn, request)
    } catch (error) {
      console.error('[classroom] connection failed', error)
      conn.terminate()
    }
  })
  http.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, conn => wss.emit('connection', conn, request))
  })
  await new Promise<void>((resolve, reject) => {
    http.once('error', reject)
    http.listen(options.port ?? 1234, options.host ?? '0.0.0.0', () => resolve())
  })
  const { port } = http.address() as AddressInfo
  const shown = !options.host || options.host === '0.0.0.0' || options.host === '::' ? 'localhost' : options.host
  return {
    port,
    url: `ws://${shown.includes(':') ? `[${shown}]` : shown}:${port}`,
    async close() {
      for (const client of wss.clients) client.terminate()
      await new Promise<void>(resolve => wss.close(() => resolve()))
      await new Promise<void>(resolve => http.close(() => resolve()))
      for (const room of rooms.values()) room.destroy()
      rooms.clear()
    },
  }
}
