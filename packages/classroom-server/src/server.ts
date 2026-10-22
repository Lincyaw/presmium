import { createHash, timingSafeEqual } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join, resolve } from 'node:path'
import { errorMessage } from '@lincyaw/kernel'
import { bracketIPv6 } from '@lincyaw/kernel/node'
import * as decoding from 'lib0/decoding'
import * as encoding from 'lib0/encoding'
import { WebSocket, WebSocketServer } from 'ws'
import * as awarenessProtocol from 'y-protocols/awareness'
import * as syncProtocol from 'y-protocols/sync'
import { hasChanges, ownAwarenessUpdate, structClients, updateRefusal, writerKey } from './permissions.ts'
import type { ClassroomWriter } from './permissions.ts'
import { awarenessMessage, MESSAGE_AWARENESS, MESSAGE_SYNC, Room, ROOM, send } from './room.ts'

const PING_INTERVAL = 30_000
export const ARCHIVED_CLOSE_CODE = 4410
export const REFUSED_CLOSE_CODE = 4403
export const ARCHIVE_DIR = '.presmium/classroom'
const MAX_MESSAGE = 1 << 20

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

function handleMessage(room: Room, conn: WebSocket, data: Uint8Array, writer: ClassroomWriter, drop: (reason: string) => void): void {
  const decoder = decoding.createDecoder(data)
  const type = decoding.readVarUint(decoder)
  if (type === MESSAGE_SYNC) {
    if (decoding.peekVarUint(decoder) !== syncProtocol.messageYjsSyncStep1) {
      const message = decoding.clone(decoder)
      decoding.readVarUint(message)
      const update = decoding.readVarUint8Array(message)
      if (room.ended) {
        if (hasChanges(update)) drop('an update after the classroom ended')
        return
      }
      const refused = writer.presenter || room.personal ? undefined : updateRefusal(room, update, writer)
      if (refused) {
        drop(refused)
        conn.close(REFUSED_CLOSE_CODE, 'update refused')
        return
      }
      const key = writerKey(writer)
      for (const client of structClients(update)) if (!room.clientWriters.has(client)) room.clientWriters.set(client, key)
    }
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, MESSAGE_SYNC)
    syncProtocol.readSyncMessage(decoder, encoder, room, conn)
    if (encoding.length(encoder) > 1) send(conn, encoding.toUint8Array(encoder))
  } else if (type === MESSAGE_AWARENESS && room.awareness) {
    const own = ownAwarenessUpdate(room, room.awareness, conn, decoding.readVarUint8Array(decoder), writer)
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
    if (archivedNames.has(name)) return { status: 410, body: { error: `classroom ${name} is archived` } }
    const room = rooms.get(name)
    if (!room) return { status: 404, body: { error: `no classroom ${name}` } }
    if (!sameKey(room.claim, key)) return { status: 403, body: { error: 'only the presenter who created the classroom can archive it' } }
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
        handleMessage(current, conn, new Uint8Array(data), writer, reason => onDropped(name, writer, reason))
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
    url: `ws://${bracketIPv6(shown)}:${port}`,
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
