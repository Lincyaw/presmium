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
 * (`<quiz>:<participant>`, `<participant>:<question>`, ...), its value says
 * so (`participant` or `author`) and is at most 16 KiB as JSON. The classroom
 * record (`session`, e.g. ending the classroom), the quizzes
 * (`store:quizzes`, opening and closing them) and the presenter's
 * synchronized state (`sync:<channel>`) are the presenter's alone. A
 * connection proves its participant with `?participant=<id>&key=<key>`: the
 * first connection that names a participant binds the id to its key. Such an
 * update must also integrate at once: one that waits for structs or deletes
 * what the room does not have would apply later to what others write. An
 * update that breaks these rules is dropped and the connection closed with
 * code 4403: the client's document holds what the room refused, so the
 * session plugin starts again from the room's. Awareness (who is connected)
 * follows the same trust: a connection sets the states of its own clients
 * only, and a learner's state names only the participant it proved, as a
 * learner. A participant's own rooms (`<room>.<key>`, named by a key only
 * that participant knows) take any write and keep no awareness. Archiving,
 * which disconnects everyone and frees the participants' rooms, takes the
 * claim key too: `POST /archive/<room>` must send it as its body. Anyone can
 * still create and archive rooms of their own, each an archive file of
 * bounded name in `<deck>/.presmium/classroom/`. Messages are at most 1 MiB.
 */
import { createHash, timingSafeEqual } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join, resolve } from 'node:path'
import { errorMessage } from '@presmium/kernel'
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
/** Close code for a connection whose update was refused: the client starts again from the room's document. */
export const REFUSED_CLOSE_CODE = 4403
/** Where archives go, relative to the deck directory. */
export const ARCHIVE_DIR = '.presmium/classroom'
/** Largest WebSocket message the server takes. */
const MAX_MESSAGE = 1 << 20
/** Largest value, as JSON, of a learner's entry. */
const MAX_ENTRY = 16 << 10

class Room extends Y.Doc {
  /** Connections, each with the awareness client ids it controls. */
  readonly conns = new Map<WebSocket, Set<number>>()
  /** Who is connected; a participant's own room has none. */
  readonly awareness?: awarenessProtocol.Awareness
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
    this.on('update', (update: Uint8Array) => {
      const encoder = encoding.createEncoder()
      encoding.writeVarUint(encoder, MESSAGE_SYNC)
      syncProtocol.writeUpdate(encoder, update)
      this.broadcast(encoding.toUint8Array(encoder))
    })
    if (this.personal) return
    const awareness = this.awareness = new awarenessProtocol.Awareness(this)
    awareness.setLocalState(null)
    awareness.on('update', ({ added, updated, removed }: Record<'added' | 'updated' | 'removed', number[]>, conn: WebSocket | null) => {
      const changed = [...added, ...updated, ...removed]
      const controlled = conn && this.conns.get(conn)
      if (controlled) {
        added.forEach(id => controlled.add(id))
        removed.forEach(id => controlled.delete(id))
      }
      this.broadcast(awarenessMessage(awareness, changed))
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

  override destroy(): void {
    this.awareness?.destroy()
    super.destroy()
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
export interface ClassroomWriter {
  presenter: boolean
  /** The participant the connection proved with its key. */
  participant?: string
}

/** Why a change to entry `key` of the top-level map `name`, now `value` (undefined: deleted), is not the participant's to make; undefined when it is. */
function entryRefusal(name: string, key: string | null, value: unknown, participant: string | undefined): string | undefined {
  if (!participant) return 'a write from a connection that proved no participant'
  if (key === null || !name.startsWith('store:') || name === 'store:quizzes') return `a write to ${name}, which is the presenter's`
  if (!key.split(':').includes(participant)) return `a write to ${name} under another participant's key`
  if (value === undefined) return undefined
  const entry = value as { participant?: unknown, author?: unknown } | null
  if (typeof entry !== 'object' || entry === null || entry instanceof Y.AbstractType || (entry.participant !== participant && entry.author !== participant)) {
    return `a value in ${name} that does not name its participant`
  }
  return JSON.stringify(entry).length > MAX_ENTRY ? `a value in ${name} over ${MAX_ENTRY} bytes` : undefined
}

/**
 * Whether an update integrates into the room at once (Yjs's own encoding,
 * read with its public API): each client's structs start where the room has
 * that client's, with no gap inside, and it deletes only structs the room or
 * the update has. Otherwise Yjs keeps the update pending and applies it
 * later, to what others write meanwhile.
 */
function integrates(room: Room, update: Uint8Array): boolean {
  const { structs, ds } = Y.decodeUpdate(update)
  if (structs.some(struct => struct instanceof Y.Skip)) return false
  const { from, to } = Y.parseUpdateMeta(update)
  const known = (client: number) => Math.max(Y.getState(room.store, client), to.get(client) ?? 0)
  return [...from].every(([client, clock]) => clock <= Y.getState(room.store, client))
    && [...ds.clients].every(([client, deletions]) => deletions.every(({ clock, len }) => clock + len <= known(client)))
}

/**
 * Why an update from a connection that is not the presenter's may not be
 * applied; undefined when it changes only its participant's entries. The
 * rules are tried on a copy of the room.
 */
function refusal(room: Room, update: Uint8Array, writer: ClassroomWriter): string | undefined {
  if (!integrates(room, update)) return 'an update that does not integrate into the room'
  const probe = new Y.Doc()
  Y.applyUpdate(probe, Y.encodeStateAsUpdate(room))
  const changes: [type: unknown, keys: Set<string | null>][] = []
  probe.on('afterTransaction', (transaction: Y.Transaction) => changes.push(...transaction.changed))
  Y.applyUpdate(probe, update)
  let refused: string | undefined
  for (const [type, keys] of changes) {
    // A change inside a nested type has no top-level name: the plugins store plain values only.
    const name = [...probe.share].find(([, shared]) => shared === type)?.[0]
    for (const key of keys) {
      refused ??= name === undefined ? 'a change inside a nested type' : entryRefusal(name, key, key === null ? undefined : probe.getMap(name).get(key), writer.participant)
    }
  }
  probe.destroy()
  return refused
}

/** Whether an update changes anything: structs or deletions. */
function changes(update: Uint8Array): boolean {
  const { structs, ds } = Y.decodeUpdate(update)
  return structs.length > 0 || ds.clients.size > 0
}

/**
 * The entries of an awareness update that change something and that the
 * connection may make: states of clients no other connection controls (nor
 * the room itself), whose participant, for a connection that is not the
 * presenter's, is the one it proved, as a learner. `dropped` counts the
 * others. y-websocket clients send on every state they receive, which
 * changes nothing and is left out without counting.
 */
function ownAwareness(room: Room, awareness: awarenessProtocol.Awareness, conn: WebSocket, update: Uint8Array, writer: ClassroomWriter): { update: Uint8Array, dropped: number } {
  const decoder = decoding.createDecoder(update)
  const kept: [client: number, clock: number, state: string][] = []
  let dropped = 0
  const count = decoding.readVarUint(decoder)
  for (let i = 0; i < count; i++) {
    const entry: [number, number, string] = [decoding.readVarUint(decoder), decoding.readVarUint(decoder), decoding.readVarString(decoder)]
    const [client, clock, state] = entry
    const known = awareness.meta.get(client)?.clock ?? -1
    if (clock < known || (clock === known && !(state === 'null' && awareness.getStates().has(client)))) continue
    if (ownClient(room, awareness, conn, client) && ownState(state, writer)) kept.push(entry)
    else dropped++
  }
  const encoder = encoding.createEncoder()
  encoding.writeVarUint(encoder, kept.length)
  for (const [client, clock, state] of kept) {
    encoding.writeVarUint(encoder, client)
    encoding.writeVarUint(encoder, clock)
    encoding.writeVarString(encoder, state)
  }
  return { update: encoding.toUint8Array(encoder), dropped }
}

function ownClient(room: Room, awareness: awarenessProtocol.Awareness, conn: WebSocket, client: number): boolean {
  return client !== awareness.clientID && ![...room.conns].some(([other, clients]) => other !== conn && clients.has(client))
}

function ownState(json: string, writer: ClassroomWriter): boolean {
  if (writer.presenter) return true
  try {
    const participant = (JSON.parse(json) as { participant?: { id?: unknown, role?: unknown } | null } | null)?.participant
    return participant == null || (writer.participant !== undefined && participant.id === writer.participant && participant.role === 'learner')
  } catch {
    return false
  }
}

function handle(room: Room, conn: WebSocket, data: Uint8Array, writer: ClassroomWriter, drop: (reason: string) => void): void {
  const decoder = decoding.createDecoder(data)
  const type = decoding.readVarUint(decoder)
  if (type === MESSAGE_SYNC) {
    // Sync step 1 asks for what the client lacks; step 2 and updates write to the room.
    if (decoding.peekVarUint(decoder) !== syncProtocol.messageYjsSyncStep1) {
      const message = decoding.clone(decoder)
      decoding.readVarUint(message)
      const update = decoding.readVarUint8Array(message)
      // An ended classroom still answers what a client asks for, but takes no updates.
      if (room.ended) {
        if (changes(update)) drop('an update after the classroom ended')
        return
      }
      const refused = writer.presenter || room.personal ? undefined : refusal(room, update, writer)
      if (refused) {
        drop(refused)
        conn.close(REFUSED_CLOSE_CODE, 'update refused')
        return
      }
    }
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, MESSAGE_SYNC)
    syncProtocol.readSyncMessage(decoder, encoder, room, conn)
    // Only sync step 1 has an answer (step 2); updates have none.
    if (encoding.length(encoder) > 1) send(conn, encoding.toUint8Array(encoder))
  } else if (type === MESSAGE_AWARENESS && room.awareness) {
    const own = ownAwareness(room, room.awareness, conn, decoding.readVarUint8Array(decoder), writer)
    if (own.dropped > 0) drop(`${own.dropped} awareness state(s) of other clients or participants`)
    awarenessProtocol.applyAwarenessUpdate(room.awareness, own.update, conn)
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
  /**
   * Called when the server drops what a connection may not write: an update
   * (the connection is then closed with `REFUSED_CLOSE_CODE`, unless the
   * classroom has ended) or awareness states. Default: a warning on the console.
   */
  onDropped?(room: string, writer: ClassroomWriter, reason: string): void
}

export interface ClassroomServer {
  readonly port: number
  /** WebSocket URL of the server on this machine, e.g. `ws://localhost:1234`. */
  readonly url: string
  /** Absolute directory of the archives. */
  readonly archiveDir: string
  close(): Promise<void>
}

function warnDropped(room: string, writer: ClassroomWriter, reason: string): void {
  const who = writer.presenter ? 'the presenter' : writer.participant ? `participant ${writer.participant}` : 'an unidentified participant'
  console.warn(`[classroom] room ${room}: dropped ${reason} from ${who}`)
}

export async function startClassroomServer(options: ClassroomServerOptions = {}): Promise<ClassroomServer> {
  const rooms = new Map<string, Room>()
  /** Names of archived rooms; their participants' rooms are `<name>.<key>`. */
  const archivedNames = new Set<string>()
  const archiveDir = resolve(options.deck ?? '.', ARCHIVE_DIR)
  const isArchived = (name: string) => [...archivedNames].some(archived => name === archived || name.startsWith(`${archived}.`))
  const onDropped = options.onDropped ?? warnDropped

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
          reply(response, 500, { error: errorMessage(error) })
        },
      )
    } else {
      response.writeHead(200, { 'Content-Type': 'text/plain' })
      response.end('presmium classroom server\n')
    }
  })
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE })

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
    const writer: ClassroomWriter = { presenter: sameKey(current.claim, claim) }
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
        handle(current, conn, new Uint8Array(data), writer, reason => onDropped(name, writer, reason))
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
      if (controlled?.size && current.awareness) awarenessProtocol.removeAwarenessStates(current.awareness, [...controlled], null)
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
    const states = current.awareness ? [...current.awareness.getStates().keys()] : []
    if (current.awareness && states.length > 0) send(conn, awarenessMessage(current.awareness, states))
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
