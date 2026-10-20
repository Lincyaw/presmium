import { createHash, timingSafeEqual } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join, resolve } from 'node:path'
import { errorMessage } from '@lincyaw/kernel'
import * as decoding from 'lib0/decoding'
import * as encoding from 'lib0/encoding'
import { WebSocket, WebSocketServer } from 'ws'
import * as awarenessProtocol from 'y-protocols/awareness'
import * as syncProtocol from 'y-protocols/sync'
import * as Y from 'yjs'

const MESSAGE_SYNC = 0
const MESSAGE_AWARENESS = 1
const PING_INTERVAL = 30_000
const ROOM = /^[\w.-]{1,128}$/
export const ARCHIVED_CLOSE_CODE = 4410
export const REFUSED_CLOSE_CODE = 4403
export const ARCHIVE_DIR = '.presmium/classroom'
const MAX_MESSAGE = 1 << 20
const MAX_ENTRY = 16 << 10

class Room extends Y.Doc {
  readonly conns = new Map<WebSocket, Set<number>>()
  readonly writers = new Map<WebSocket, string>()
  readonly authors = new Map<number, string>()
  readonly awareness?: awarenessProtocol.Awareness
  archived = false
  claim?: Buffer
  readonly participants = new Map<string, Buffer>()
  readonly personal: boolean

  constructor(name: string) {
    super({ gc: true })
    this.authors.set(this.clientID, '')
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
        const writer = this.writers.get(conn)!
        for (const id of added) if (!this.authors.has(id)) this.authors.set(id, writer)
      }
      this.broadcast(awarenessMessage(awareness, changed))
    })
  }

  get session(): Y.Map<unknown> {
    return this.getMap('session')
  }

  get ended(): boolean {
    return this.session.get('status') === 'ended'
  }

  broadcast(message: Uint8Array): void {
    for (const conn of this.conns.keys()) send(conn, message)
  }

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

function roomName(url = '/'): string | undefined {
  const name = url.slice(1).split('?')[0]!
  return ROOM.test(name) ? name : undefined
}

function paramsOf(url = '/'): URLSearchParams {
  return new URL(url, 'http://classroom').searchParams
}

function digest(key: string): Buffer {
  return createHash('sha256').update(key).digest()
}

function sameKey(known: Buffer | undefined, key: string | null): boolean {
  return Boolean(known && key && timingSafeEqual(known, digest(key)))
}

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

export interface ClassroomWriter {
  presenter: boolean
  participant?: string
}

function writerKey(writer: ClassroomWriter): string {
  return writer.presenter ? 'presenter' : `participant:${writer.participant ?? ''}`
}

function structClients(update: Uint8Array): number[] {
  return [...Y.parseUpdateMeta(update).from.keys()]
}

const PARTICIPANT_FIRST = new Set(['store:questions'])

function ownKey(name: string, key: string, participant: string): boolean {
  return PARTICIPANT_FIRST.has(name) ? key.slice(0, key.indexOf(':')) === participant : key.slice(key.lastIndexOf(':') + 1) === participant
}

function names(value: unknown, participant: string): boolean {
  const entry = value as { participant?: unknown, author?: unknown } | null
  return typeof entry === 'object' && entry !== null && !(entry instanceof Y.AbstractType) && (entry.participant === participant || entry.author === participant)
}

function entryRefusal(name: string, key: string | null, before: unknown, value: unknown, participant: string | undefined): string | undefined {
  if (!participant) return 'a write from a connection that proved no participant'
  if (key === null || !name.startsWith('store:') || name === 'store:quizzes') return `a write to ${name}, which is the presenter's`
  if (!key.includes(':') || !ownKey(name, key, participant)) return `a write to ${name} under another participant's key`
  if (before !== undefined && !names(before, participant)) return `a change to another participant's entry in ${name}`
  if (value === undefined) return undefined
  if (!names(value, participant)) return `a value in ${name} that does not name its participant`
  return JSON.stringify(value).length > MAX_ENTRY ? `a value in ${name} over ${MAX_ENTRY} bytes` : undefined
}

function entryBefore(room: Y.Doc, name: string, key: string | null): unknown {
  if (key === null || !room.share.has(name)) return undefined
  try {
    return room.getMap(name).get(key)
  } catch {
    return undefined
  }
}

function pending(doc: Y.Doc): [structs: Uint8Array, deletions: Uint8Array] {
  return [doc.store.pendingStructs?.update ?? new Uint8Array(), doc.store.pendingDs ?? new Uint8Array()]
}

function refusal(room: Room, update: Uint8Array, writer: ClassroomWriter): string | undefined {
  const own = writerKey(writer)
  if (structClients(update).some(client => (room.authors.get(client) ?? own) !== own)) return 'an update in the name of another writer\'s client'
  const probe = new Y.Doc()
  Y.applyUpdate(probe, Y.encodeStateAsUpdate(room))
  const before = pending(probe)
  const changes: [type: unknown, keys: Set<string | null>][] = []
  probe.on('afterTransaction', (transaction: Y.Transaction) => changes.push(...transaction.changed))
  Y.applyUpdate(probe, update)
  const after = pending(probe)
  let refused = before.every((bytes, i) => Buffer.compare(bytes, after[i]!) === 0) ? undefined : 'an update that does not integrate into the room'
  for (const [type, keys] of changes) {
    const name = [...probe.share].find(([, shared]) => shared === type)?.[0]
    for (const key of keys) {
      refused ??= name === undefined ? 'a change inside a nested type' : entryRefusal(name, key, entryBefore(room, name, key), key === null ? undefined : probe.getMap(name).get(key), writer.participant)
    }
  }
  probe.destroy()
  return refused
}

function changes(update: Uint8Array): boolean {
  const { structs, ds } = Y.decodeUpdate(update)
  return structs.length > 0 || ds.clients.size > 0
}

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
    if (ownClient(room, conn, client, writer) && ownState(state, writer)) kept.push(entry)
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

function ownClient(room: Room, conn: WebSocket, client: number, writer: ClassroomWriter): boolean {
  const own = writerKey(writer)
  return (room.authors.get(client) ?? own) === own && ![...room.conns].some(([other, clients]) => other !== conn && clients.has(client))
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
    if (decoding.peekVarUint(decoder) !== syncProtocol.messageYjsSyncStep1) {
      const message = decoding.clone(decoder)
      decoding.readVarUint(message)
      const update = decoding.readVarUint8Array(message)
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
      const key = writerKey(writer)
      for (const client of structClients(update)) if (!room.authors.has(client)) room.authors.set(client, key)
    }
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, MESSAGE_SYNC)
    syncProtocol.readSyncMessage(decoder, encoder, room, conn)
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
  port?: number
  host?: string
  deck?: string
  onDropped?(room: string, writer: ClassroomWriter, reason: string): void
}

export interface ClassroomServer {
  readonly port: number
  readonly url: string
  readonly archiveDir: string
  close(): Promise<void>
}

function warnDropped(room: string, writer: ClassroomWriter, reason: string): void {
  const who = writer.presenter ? 'the presenter' : writer.participant ? `participant ${writer.participant}` : 'an unidentified participant'
  console.warn(`[classroom] room ${room}: dropped ${reason} from ${who}`)
}

export async function startClassroomServer(options: ClassroomServerOptions = {}): Promise<ClassroomServer> {
  const rooms = new Map<string, Room>()
  const archivedNames = new Set<string>()
  const archiveDir = resolve(options.deck ?? '.', ARCHIVE_DIR)
  const isArchived = (name: string) => [...archivedNames].some(archived => name === archived || name.startsWith(`${archived}.`))
  const onDropped = options.onDropped ?? warnDropped

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
    const participant = params.get('participant')
    const key = params.get('key')
    if (participant && key && ROOM.test(participant)) {
      if (!current.participants.has(participant)) current.participants.set(participant, digest(key))
      if (sameKey(current.participants.get(participant), key)) writer.participant = participant
    }
    current.conns.set(conn, new Set())
    current.writers.set(conn, writerKey(writer))
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
      current.writers.delete(conn)
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
