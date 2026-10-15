/**
 * The classroom server: a y-websocket room server. Each room (the URL path,
 * e.g. `ws://host:1234/<room>`) is one shared Yjs document that the session
 * plugin's clients (y-websocket providers) sync with, plus their awareness
 * (who is connected). Rooms stay in memory while the server runs, so a
 * classroom survives reconnects and a late joiner gets its whole state.
 *
 * It speaks the y-websocket protocol through `y-protocols`, the building
 * blocks of y-websocket itself. Beyond that it knows the layout of the session
 * plugin's document (`session`, `store:<collection>`, `sync:<channel>` maps).
 * A room whose classroom has ended (`status` in the `session` map) is
 * read-only. `POST /archive/<room>` archives a classroom (P-60): it writes the
 * document as JSON to `<deck>/.presmium/classroom/<room>.json` and frees the
 * room, together with the participants' own rooms `<room>.<key>`; clients
 * still connected, or connecting later, are closed with code 4410, which
 * y-websocket providers do not retry.
 *
 * Trust: the server is meant for a classroom's own network. Whoever has a
 * join link can connect and read the classroom, but the presenter's rights
 * are enforced here (domain model, section 8). The window that creates a
 * room claims it by connecting with `?claim=<key>`; connections that present
 * that key are the presenter's and may write anything. Any other connection
 * may write only its participant's own entries of the classroom store
 * (`store:<collection>`): the entry's key names the participant
 * (`<quiz>:<participant>`, `<participant>:<question>`, ...) and its value
 * says so (`participant` or `author`). The classroom record (`session`, e.g.
 * ending the classroom), the quizzes (`store:quizzes`, opening and closing
 * them) and the presenter's synchronized state (`sync:<channel>`) are the
 * presenter's alone. A connection proves its participant with
 * `?participant=<id>&key=<key>`: the first connection that names a
 * participant binds the id to its key. An update that breaks these rules is
 * dropped. A participant's own rooms (`<room>.<key>`, named by a key only
 * that participant knows) take any write. Archiving, which disconnects
 * everyone and frees the participants' rooms, takes the claim key too:
 * `POST /archive/<room>` must send it as its body. Anyone can still create
 * and archive rooms of their own, each an archive file of bounded name in
 * `<deck>/.presmium/classroom/`.
 */
import { createHash, timingSafeEqual } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join, resolve } from 'node:path'
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
/** Close code for an archived room: in the 4400-4499 range, so clients stop reconnecting. */
export const ARCHIVED_CLOSE_CODE = 4410
/** Where archives go, relative to the deck directory. */
export const ARCHIVE_DIR = '.presmium/classroom'

class Room extends Y.Doc {
  /** Connections, each with the awareness client ids it controls. */
  readonly conns = new Map<WebSocket, Set<number>>()
  readonly awareness = new awarenessProtocol.Awareness(this)
  /** Archived: freed once its last connection has closed. */
  archived = false
  /** Digest of the key that archives the room, from the first connection that claimed it. */
  claim?: Buffer
  /** Digests of the participants' keys, by participant id, from the first connection that named each. */
  readonly participants = new Map<string, Buffer>()
  /** A participant's own room, `<room>.<key>`: whoever knows its name may write to it. */
  readonly personal: boolean

  constructor(name: string) {
    super({ gc: true })
    this.personal = name.includes('.')
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

  /** The classroom record of the session plugin (its `session` map). */
  get session(): Y.Map<unknown> {
    return this.getMap('session')
  }

  /** A classroom that has ended accepts no more writes. */
  get ended(): boolean {
    return this.session.get('status') === 'ended'
  }

  broadcast(message: Uint8Array): void {
    for (const conn of this.conns.keys()) send(conn, message)
  }

  /** The document as JSON: every top-level type is a map in the session plugin's layout. */
  content(): Record<string, unknown> {
    return Object.fromEntries([...this.share.keys()].map(key => [key, this.getMap(key).toJSON()]))
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

/** The parameters of a connection: `claim`, the presenter's key to the room; `participant` and its `key`. */
function paramsOf(url = '/'): URLSearchParams {
  return new URL(url, 'http://classroom').searchParams
}

function digest(key: string): Buffer {
  return createHash('sha256').update(key).digest()
}

function sameKey(known: Buffer | undefined, key: string | null): boolean {
  return Boolean(known && key && timingSafeEqual(known, digest(key)))
}

/** The body of a small request, at most `limit` bytes. */
function readBody(request: IncomingMessage, limit = 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    let text = ''
    request.setEncoding('utf8')
    request.on('data', (chunk: string) => {
      text += chunk
      if (text.length > limit) request.destroy(new Error('request too large'))
    })
    request.on('end', () => resolve(text))
    request.on('error', reject)
  })
}

/** What a connection may write: anything from the presenter's windows, else its participant's own entries. */
interface Writer {
  presenter: boolean
  /** The participant the connection proved with its key. */
  participant?: string
}

/** Whether a change to entry `key` of the top-level map `name`, now `value` (undefined: deleted), is the participant's to make. */
function ownEntry(name: string, key: string | null, value: unknown, participant: string | undefined): boolean {
  if (!participant || key === null || !name.startsWith('store:') || name === 'store:quizzes') return false
  if (!key.split(':').includes(participant)) return false
  if (value === undefined) return true
  const entry = value as { participant?: unknown, author?: unknown } | null
  return typeof entry === 'object' && entry !== null && !(entry instanceof Y.AbstractType) && (entry.participant === participant || entry.author === participant)
}

/** Whether an update from a connection that is not the presenter's changes only its participant's entries: it is tried on a copy of the room. */
function admissible(room: Room, update: Uint8Array, writer: Writer): boolean {
  const probe = new Y.Doc()
  Y.applyUpdate(probe, Y.encodeStateAsUpdate(room))
  const changes: [type: unknown, keys: Set<string | null>][] = []
  probe.on('afterTransaction', (transaction: Y.Transaction) => changes.push(...transaction.changed))
  Y.applyUpdate(probe, update)
  // A change inside a nested type has no top-level name: the plugins store plain values only.
  const named = changes.map(([type, keys]) => [[...probe.share].find(([, shared]) => shared === type)?.[0], keys] as const)
  const ok = named.every(([name, keys]) => name !== undefined
    && [...keys].every(key => ownEntry(name, key, key === null ? undefined : probe.getMap(name).get(key), writer.participant)))
  probe.destroy()
  return ok
}

function handle(room: Room, conn: WebSocket, data: Uint8Array, writer: Writer): void {
  const decoder = decoding.createDecoder(data)
  const type = decoding.readVarUint(decoder)
  if (type === MESSAGE_SYNC) {
    // Sync step 1 asks for what the client lacks; step 2 and updates write to the room.
    if (decoding.peekVarUint(decoder) !== syncProtocol.messageYjsSyncStep1) {
      // An ended classroom still answers what a client asks for, but takes no updates.
      if (room.ended) return
      if (!writer.presenter && !room.personal) {
        const update = decoding.clone(decoder)
        decoding.readVarUint(update)
        if (!admissible(room, decoding.readVarUint8Array(update), writer)) {
          console.warn(`[classroom] dropped an update to the classroom that is not ${writer.participant ? `participant ${writer.participant}'s` : 'an identified participant\'s'} to write`)
          return
        }
      }
    }
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, MESSAGE_SYNC)
    syncProtocol.readSyncMessage(decoder, encoder, room, conn)
    // Only sync step 1 has an answer (step 2); updates have none.
    if (encoding.length(encoder) > 1) send(conn, encoding.toUint8Array(encoder))
  } else if (type === MESSAGE_AWARENESS) {
    awarenessProtocol.applyAwarenessUpdate(room.awareness, decoding.readVarUint8Array(decoder), conn)
  }
}

function reply(response: ServerResponse, status: number, body: Record<string, unknown>): void {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  response.end(`${JSON.stringify(body)}\n`)
}

export interface ClassroomServerOptions {
  /** 0 picks a free port. Default 1234, as y-websocket. */
  port?: number
  /** Default: every interface, so learners on the local network can join. */
  host?: string
  /** The deck directory, under which archives are written (`.presmium/classroom/`). Default: the working directory. */
  deck?: string
}

export interface ClassroomServer {
  readonly port: number
  /** WebSocket URL of the server on this machine, e.g. `ws://localhost:1234`. */
  readonly url: string
  /** Absolute directory of the archives. */
  readonly archiveDir: string
  close(): Promise<void>
}

export async function startClassroomServer(options: ClassroomServerOptions = {}): Promise<ClassroomServer> {
  const rooms = new Map<string, Room>()
  /** Names of archived rooms; their participants' rooms are `<name>.<key>`. */
  const archivedNames = new Set<string>()
  const archiveDir = resolve(options.deck ?? '.', ARCHIVE_DIR)
  const isArchived = (name: string) => [...archivedNames].some(archived => name === archived || name.startsWith(`${archived}.`))

  /** Writes the classroom to its archive file, then frees it and its participants' rooms; `key` must be the room's. */
  async function archive(name: string, key: string): Promise<{ status: number, body: Record<string, unknown> }> {
    if (archivedNames.has(name)) return { status: 410, body: { error: `课堂 ${name} 已归档` } }
    const room = rooms.get(name)
    if (!room) return { status: 404, body: { error: `没有课堂 ${name}` } }
    if (!sameKey(room.claim, key)) return { status: 403, body: { error: '只有创建课堂的主讲可以归档' } }
    const now = Date.now()
    room.transact(() => {
      if (!room.ended) {
        room.session.set('status', 'ended')
        room.session.set('endedAt', now)
      }
    })
    const file = join(ARCHIVE_DIR, `${name}.json`)
    await mkdir(archiveDir, { recursive: true })
    await writeFile(join(archiveDir, `${name}.json`), `${JSON.stringify({ room: name, archivedAt: new Date(now).toISOString(), document: room.content() }, null, 2)}\n`)
    // Tells the clients before closing their connections, so they show it and stop.
    room.transact(() => {
      room.session.set('archivedAt', now)
      room.session.set('archive', file)
    })
    archivedNames.add(name)
    for (const [key, freed] of rooms) {
      if (!isArchived(key)) continue
      rooms.delete(key)
      freed.archived = true
      if (freed.conns.size === 0) freed.destroy()
      for (const conn of freed.conns.keys()) conn.close(ARCHIVED_CLOSE_CODE, 'classroom archived')
    }
    console.log(`[classroom] room ${name} archived to ${join(archiveDir, `${name}.json`)}`)
    return { status: 200, body: { file } }
  }

  const http = createServer((request, response) => {
    // The deck is served from another origin.
    response.setHeader('Access-Control-Allow-Origin', '*')
    const target = /^\/archive\/([^/?]+)(?:\?|$)/.exec(request.url ?? '')
    if (request.method === 'OPTIONS') {
      response.writeHead(204, { 'Access-Control-Allow-Methods': 'POST' })
      response.end()
    } else if (request.method === 'POST' && target && ROOM.test(target[1]!)) {
      readBody(request).then(key => archive(target[1]!, key.trim())).then(
        ({ status, body }) => reply(response, status, body),
        (error: unknown) => {
          console.error(`[classroom] room ${target[1]}: archive failed`, error)
          reply(response, 500, { error: error instanceof Error ? error.message : String(error) })
        },
      )
    } else {
      response.writeHead(200, { 'Content-Type': 'text/plain' })
      response.end('presmium classroom server\n')
    }
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
    if (isArchived(name)) {
      conn.close(ARCHIVED_CLOSE_CODE, 'classroom archived')
      return
    }
    let room = rooms.get(name)
    if (!room) rooms.set(name, room = new Room(name))
    const current = room
    const params = paramsOf(request.url)
    const claim = params.get('claim')
    if (claim && !current.claim) current.claim = digest(claim)
    const writer: Writer = { presenter: sameKey(current.claim, claim) }
    // The first connection that names a participant binds the id to its key; later ones must bring the same key.
    const participant = params.get('participant')
    const key = params.get('key')
    if (participant && key && ROOM.test(participant)) {
      if (!current.participants.has(participant)) current.participants.set(participant, digest(key))
      if (sameKey(current.participants.get(participant), key)) writer.participant = participant
    }
    current.conns.set(conn, new Set())
    conn.binaryType = 'arraybuffer'
    conn.on('message', (data: ArrayBuffer) => {
      try {
        handle(current, conn, new Uint8Array(data), writer)
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
      if (current.archived) {
        if (current.conns.size === 0) current.destroy()
        return
      }
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
    archiveDir,
    async close() {
      for (const client of wss.clients) client.terminate()
      await new Promise<void>(resolve => wss.close(() => resolve()))
      await new Promise<void>(resolve => http.close(() => resolve()))
      for (const room of rooms.values()) room.destroy()
      rooms.clear()
    },
  }
}
