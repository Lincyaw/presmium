// The classroom server as a real server (in this process, so a test can wait for the writes it
// drops), with y-websocket clients as the session plugin uses and raw WebSocket clients that send
// what a forged client would; one test starts the `presmium-classroom-server` command.
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { connect } from 'node:net'
import { networkInterfaces, tmpdir } from 'node:os'
import { join as joinPath } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as encoding from 'lib0/encoding'
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest'
import WebSocket from 'ws'
import * as syncProtocol from 'y-protocols/sync'
import { WebsocketProvider } from 'y-websocket'
import * as Y from 'yjs'
import { startClassroomServer } from '../src/index.ts'
import type { ClassroomServer, ClassroomWriter } from '../src/index.ts'

const BIN = fileURLToPath(new URL('../bin/server.mjs', import.meta.url))
const deck = mkdtempSync(joinPath(tmpdir(), 'presmium-classroom-'))
let server: ClassroomServer
let url = ''
const dropped: { room: string, writer: ClassroomWriter, reason: string }[] = []
const providers: WebsocketProvider[] = []
const sockets: WebSocket[] = []

beforeAll(async () => {
  server = await startClassroomServer({ port: 0, host: '127.0.0.1', deck, onDropped: (room, writer, reason) => void dropped.push({ room, writer, reason }) })
  url = server.url
})

// Each test's clients leave when it ends.
afterEach(() => {
  providers.splice(0).forEach(p => p.destroy())
  sockets.splice(0).forEach(s => s.terminate())
})

afterAll(async () => {
  await server.close()
  rmSync(deck, { recursive: true, force: true })
})

/** A client document in a room, once it has synced with the server; `params` go in the URL (e.g. `claim`). */
async function join(room: string, params: Record<string, string> = {}): Promise<{ doc: Y.Doc, provider: WebsocketProvider }> {
  const doc = new Y.Doc()
  const provider = new WebsocketProvider(url, room, doc, { WebSocketPolyfill: WebSocket as never, disableBc: true, params })
  providers.push(provider)
  await new Promise<void>(resolve => provider.once('sync', () => resolve()))
  return { doc, provider }
}

/** A raw connection to a room, open. */
async function socket(room: string, params: Record<string, string>): Promise<WebSocket> {
  const ws = new WebSocket(`${url}/${room}?${new URLSearchParams(params)}`)
  sockets.push(ws)
  await new Promise(resolve => ws.once('open', resolve))
  return ws
}

const closed = (ws: WebSocket) => new Promise<number>(resolve => ws.once('close', resolve))
const providerClosed = (provider: WebsocketProvider) => new Promise<number>(resolve => provider.once('closed', ({ code }: { code: number }) => resolve(code)))
const drops = (room: string) => dropped.filter(d => d.room === room)

/** A sync message with a Yjs update, as y-websocket clients send their changes. */
function updateMessage(update: Uint8Array): Uint8Array {
  const encoder = encoding.createEncoder()
  encoding.writeVarUint(encoder, 0)
  syncProtocol.writeUpdate(encoder, update)
  return encoding.toUint8Array(encoder)
}

/** An awareness message setting the states of the given clients. */
function awarenessMessage(states: [client: number, clock: number, state: unknown][]): Uint8Array {
  const update = encoding.createEncoder()
  encoding.writeVarUint(update, states.length)
  for (const [client, clock, state] of states) {
    encoding.writeVarUint(update, client)
    encoding.writeVarUint(update, clock)
    encoding.writeVarString(update, JSON.stringify(state))
  }
  const encoder = encoding.createEncoder()
  encoding.writeVarUint(encoder, 1)
  encoding.writeVarUint8Array(encoder, encoding.toUint8Array(update))
  return encoding.toUint8Array(encoder)
}

/** An answer of participant `p` to quiz `q`, as the classroom plugin writes it. */
const answer = (q: string, p: string, choice: number) => [`${q}:${p}`, { quiz: q, participant: p, choice: [choice] }] as const

it('starts from the command, which prints its address and, on every interface, its addresses on the network (P-60)', async () => {
  const child = spawn(process.execPath, [BIN, '--port', '0', '--deck', deck], { stdio: ['ignore', 'pipe', 'inherit'] })
  try {
    const output = await new Promise<string>((resolve, reject) => {
      let text = ''
      child.stdout!.on('data', (chunk: Buffer) => {
        text += chunk
        if (text.includes('archives')) resolve(text)
      })
      child.once('exit', code => reject(new Error(`server exited (${code}): ${text}`)))
    })
    const port = /^classroom server {2}ws:\/\/localhost:(\d+)$/m.exec(output)?.[1]
    expect(port, output).toBeDefined()
    const lan = Object.values(networkInterfaces()).flat().filter(entry => entry?.family === 'IPv4' && !entry.internal).map(entry => entry!.address)
    for (const address of lan) expect(output).toContain(`network           ws://${address}:${port}`)
  } finally {
    child.kill('SIGTERM')
  }
})

it('syncs the documents of a room, keeps them for late joiners, and keeps rooms apart', async () => {
  const a = await join('room-a', { claim: 'presenter-key' })
  const b = await join('room-a')
  const other = await join('room-b')

  a.doc.getMap('session').set('status', 'active')
  await expect.poll(() => b.doc.getMap('session').get('status')).toBe('active')

  // A client that joins later gets the room's state; another room never sees it.
  const late = await join('room-a')
  expect(late.doc.getMap('session').get('status')).toBe('active')
  expect(other.doc.getMap('session').get('status')).toBeUndefined()

  // Awareness: who is connected, and who left.
  a.provider.awareness.setLocalStateField('participant', { name: '主讲' })
  await expect.poll(() => [...b.provider.awareness.getStates().values()].map(s => s.participant?.name)).toContain('主讲')
  a.provider.destroy()
  await expect.poll(() => [...b.provider.awareness.getStates().values()].map(s => s.participant?.name)).not.toContain('主讲')
})

it('closes a connection with a bad room path or an invalid frame and keeps serving the rooms', async () => {
  const before = await join('room-c', { claim: 'presenter-key' })
  before.doc.getMap('session').set('status', 'active')

  const badPath = new WebSocket(`${url}/%E0%A4%A`)
  badPath.on('error', () => {})
  expect(await new Promise(resolve => badPath.once('close', resolve))).toBe(1008)

  // A client frame without a mask breaks the protocol.
  const { hostname, port } = new URL(url)
  const raw = connect(Number(port), hostname)
  raw.on('error', () => {})
  raw.write('GET /room-c HTTP/1.1\r\nHost: classroom\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n')
  await new Promise(resolve => raw.once('data', resolve))
  raw.write(Buffer.from([0x82, 0x01, 0x00]))
  await new Promise(resolve => raw.once('close', resolve))

  const after = await join('room-c')
  expect(after.doc.getMap('session').get('status')).toBe('active')
})

it('takes no more writes once the classroom has ended', async () => {
  const presenter = await join('room-d', { claim: 'presenter-key' })
  const learner = await join('room-d', { participant: 'p1', key: 'p1-key' })
  const answers = (doc: Y.Doc) => doc.getMap('store:answers')
  answers(learner.doc).set(...answer('q', 'p1', 0))
  presenter.doc.getMap('session').set('status', 'ended')
  await expect.poll(() => learner.doc.getMap('session').get('status')).toBe('ended')

  answers(learner.doc).set(...answer('q2', 'p1', 1))
  // The server has dropped the late write: a client that joins now reads the classroom without it.
  await expect.poll(() => drops('room-d').map(d => d.reason)).toEqual(['an update after the classroom ended'])
  const late = await join('room-d')
  expect(Object.keys(answers(late.doc).toJSON())).toEqual(['q:p1'])
})

it('takes the presenter\'s writes only from the presenter, and a learner\'s entries only under their own id and of bounded size (P-60)', async () => {
  const presenter = await join('room-f', { claim: 'presenter-key', participant: 'teacher', key: 'teacher-key' })
  const learner = await join('room-f', { participant: 'p1', key: 'p1-key' })
  // Someone who knows p1's id from the room, but not p1's key, is not p1.
  const impostor = await join('room-f', { participant: 'p1', key: 'guessed' })
  presenter.doc.getMap('session').set('status', 'active')
  await expect.poll(() => learner.doc.getMap('session').get('status')).toBe('active')

  // A learner's own answer counts.
  learner.doc.getMap('store:answers').set(...answer('s/quiz2', 'p1', 1))
  await expect.poll(() => presenter.doc.getMap('store:answers').has('s/quiz2:p1')).toBe(true)

  // A learner cannot end the classroom, nor open a quiz (each write from a connection of its own,
  // which the server closes), nor answer for another participant, under the other's id or with
  // the other's id in the answer, nor write a value over 16 KiB.
  const learners = await Promise.all([1, 2, 3, 4, 5].map(() => join('room-f', { participant: 'p1', key: 'p1-key' })))
  const closes = learners.map(l => providerClosed(l.provider))
  learners[0]!.doc.getMap('session').set('status', 'ended')
  learners[1]!.doc.getMap('store:quizzes').set('s/quiz', { open: true })
  learners[2]!.doc.getMap('store:answers').set(...answer('s/quiz', 'p2', 0))
  learners[3]!.doc.getMap('store:answers').set('s/quiz:p1', { quiz: 's/quiz', participant: 'p2', choice: [0] })
  learners[4]!.doc.getMap('store:questions').set('p1:big', { author: 'p1', text: 'x'.repeat(20_000) })
  impostor.doc.getMap('store:answers').set(...answer('s/other', 'p1', 2))

  await expect.poll(() => drops('room-f').length).toBe(6)
  expect(await Promise.all(closes)).toEqual([4403, 4403, 4403, 4403, 4403])
  expect(drops('room-f').map(d => d.reason)).toContain('a value in store:questions over 16384 bytes')
  // Writes after a dropped one are taken as before.
  learner.doc.getMap('store:answers').set(...answer('s/quiz3', 'p1', 0))
  await expect.poll(() => presenter.doc.getMap('store:answers').has('s/quiz3:p1')).toBe(true)
  const late = await join('room-f')
  expect(late.doc.getMap('session').get('status')).toBe('active')
  expect(late.doc.getMap('store:quizzes').toJSON()).toEqual({})
  expect(Object.keys(late.doc.getMap('store:answers').toJSON()).sort()).toEqual(['s/quiz2:p1', 's/quiz3:p1'])
  expect(late.doc.getMap('store:questions').toJSON()).toEqual({})

  // The presenter opens a quiz and ends the classroom.
  presenter.doc.getMap('store:quizzes').set('s/quiz', { open: true })
  presenter.doc.getMap('session').set('status', 'ended')
  await expect.poll(() => late.doc.getMap('session').get('status')).toBe('ended')
  expect(late.doc.getMap('store:quizzes').toJSON()).toEqual({ 's/quiz': { open: true } })
})

/**
 * An update with one struct of a client of its own that sets `value` right after the struct of
 * `client` at `clock`, encoded as Yjs does (version 1): a forged client can send it before
 * that struct exists.
 */
function structAfter(client: number, clock: number, value: unknown): Uint8Array {
  const encoder = encoding.createEncoder()
  encoding.writeVarUint(encoder, 1) // one client
  encoding.writeVarUint(encoder, 1) // with one struct
  encoding.writeVarUint(encoder, 987654321) // the client
  encoding.writeVarUint(encoder, 0) // from clock 0
  encoding.writeUint8(encoder, 0x80 | 8) // an item with an origin, its content any value
  encoding.writeVarUint(encoder, client)
  encoding.writeVarUint(encoder, clock)
  encoding.writeVarUint(encoder, 1)
  encoding.writeAny(encoder, value as never)
  encoding.writeVarUint(encoder, 0) // no deletions
  return encoding.toUint8Array(encoder)
}

it('refuses a learner\'s update that would wait in the room, such as one deleting what the presenter writes next or placing a value after it (P-60, P-61)', async () => {
  const presenter = await join('room-g', { claim: 'presenter-key' })
  presenter.doc.getMap('session').set('status', 'active')
  const next = Y.getState(presenter.doc.store, presenter.doc.clientID)
  // A delete set for the presenter's next 20 structs, which nobody has yet: without structs of its
  // own, it would wait in the room and delete what the presenter writes next.
  const future = new Y.Doc()
  future.clientID = presenter.doc.clientID
  Y.applyUpdate(future, Y.encodeStateAsUpdate(presenter.doc))
  for (let i = 0; i < 20; i++) future.getMap('scratch').set('x', i)
  future.getMap('scratch').delete('x')
  const forged = await socket('room-g', { participant: 'p1', key: 'p1-key' })
  const code = closed(forged)
  forged.send(updateMessage(Y.encodeStateAsUpdate(future, Y.encodeStateVector(future))))
  expect(await code).toBe(4403)
  // A value after the presenter's fourth struct from now, the third cursor below: it would wait in
  // the room, then become the cursor that the presenter's windows and the learners follow.
  const placed = await socket('room-g', { participant: 'p1', key: 'p1-key' })
  const placedCode = closed(placed)
  placed.send(updateMessage(structAfter(presenter.doc.clientID, next + 3, { slide: 666, step: 0 })))
  expect(await placedCode).toBe(4403)
  expect(drops('room-g').map(d => d.reason)).toEqual(Array(2).fill('an update that does not integrate into the room'))

  presenter.doc.getMap('store:quizzes').set('q2', { open: true })
  for (const slide of [1, 2, 3]) presenter.doc.getMap('session').set('cursor', { slide, step: 0 })
  expect(Y.getState(presenter.doc.store, presenter.doc.clientID)).toBe(next + 4)
  const late = await join('room-g')
  await expect.poll(() => late.doc.getMap('session').get('cursor')).toEqual({ slide: 3, step: 0 })
  expect(late.doc.getMap('store:quizzes').get('q2')).toEqual({ open: true })
  expect(presenter.doc.getMap('session').get('cursor')).toEqual({ slide: 3, step: 0 })
})

it('refuses a learner\'s structs in the name of the presenter\'s client, which would make the presenter\'s own write of that clock a duplicate that every document ignores (P-60, P-61)', async () => {
  const presenter = await join('room-j', { claim: 'presenter-key' })
  presenter.provider.awareness.setLocalStateField('participant', { id: 'teacher', name: '王老师', role: 'presenter' })
  const learner = await join('room-j', { participant: 'p1', key: 'p1-key' })
  // The presenter has written nothing yet: the room knows its client from awareness only.
  await expect.poll(() => learner.provider.awareness.getStates().has(presenter.doc.clientID)).toBe(true)
  /** The learner's own answer, written as the presenter's client at the clock the presenter writes next. */
  const forge = (choice: number) => {
    const forged = new Y.Doc()
    Y.applyUpdate(forged, Y.encodeStateAsUpdate(presenter.doc))
    // After the update: a document that receives structs of its own client takes another.
    forged.clientID = presenter.doc.clientID
    const before = Y.encodeStateVector(forged)
    forged.getMap('store:answers').set(...answer('q', 'p1', choice))
    return updateMessage(Y.encodeStateAsUpdate(forged, before))
  }
  const first = await socket('room-j', { participant: 'p1', key: 'p1-key' })
  const firstCode = closed(first)
  first.send(forge(0))
  expect(await firstCode).toBe(4403)

  presenter.doc.getMap('session').set('status', 'active')
  await expect.poll(() => learner.doc.getMap('session').get('status')).toBe('active')
  const second = await socket('room-j', { participant: 'p1', key: 'p1-key' })
  const secondCode = closed(second)
  second.send(forge(1))
  expect(await secondCode).toBe(4403)
  expect(drops('room-j').map(d => d.reason)).toEqual(Array(2).fill('an update in the name of another writer\'s client'))

  // The presenter's next writes count, for the learner and for a late joiner; the forged answers do not.
  presenter.doc.getMap('store:quizzes').set('q', { open: true })
  await expect.poll(() => learner.doc.getMap('store:quizzes').get('q')).toEqual({ open: true })
  const late = await join('room-j')
  expect(late.doc.getMap('session').get('status')).toBe('active')
  expect(late.doc.getMap('store:quizzes').get('q')).toEqual({ open: true })
  expect(late.doc.getMap('store:answers').toJSON()).toEqual({})
})

it('closes the connection of a refused update, and takes the learner\'s writes again once the client starts over', async () => {
  const presenter = await join('room-h', { claim: 'presenter-key' })
  const learner = await join('room-h', { participant: 'p1', key: 'p1-key' })
  const code = providerClosed(learner.provider)
  learner.doc.getMap('store:quizzes').set('q', { open: true })
  expect(await code).toBe(4403)
  // As the session plugin does: a new document, connected again with the same participant.
  const again = await join('room-h', { participant: 'p1', key: 'p1-key' })
  again.doc.getMap('store:answers').set(...answer('q', 'p1', 1))
  await expect.poll(() => presenter.doc.getMap('store:answers').get('q:p1')).toEqual({ quiz: 'q', participant: 'p1', choice: [1] })
  expect(presenter.doc.getMap('store:quizzes').toJSON()).toEqual({})
})

it('takes awareness states only for a connection\'s own clients, naming the participant it proved (P-60)', async () => {
  const presenter = await join('room-i', { claim: 'presenter-key', participant: 'teacher', key: 'teacher-key' })
  presenter.provider.awareness.setLocalStateField('participant', { id: 'teacher', name: '王老师', role: 'presenter' })
  const learner = await join('room-i', { participant: 'p1', key: 'p1-key' })
  learner.provider.awareness.setLocalStateField('participant', { id: 'p1', name: '小明', role: 'learner' })
  const names = () => [...presenter.provider.awareness.getStates().values()].map(s => s.participant?.name).filter(Boolean).sort()
  await expect.poll(names).toEqual(['小明', '王老师'])

  const attacker = await socket('room-i', { participant: 'p2', key: 'p2-key' })
  attacker.send(awarenessMessage([
    // The presenter's client leaves; a client of its own claims to be the presenter; the learner is renamed.
    [presenter.doc.clientID, 1000, null],
    [424242, 1, { participant: { id: 'p0', name: '冒充的主讲', role: 'presenter' } }],
    [learner.doc.clientID, 1000, { participant: { id: 'p1', name: '改掉的名字', role: 'learner' } }],
  ]))
  // Its own client as itself, which counts.
  attacker.send(awarenessMessage([[424242, 2, { participant: { id: 'p2', name: 'Eve', role: 'learner' } }]]))
  await expect.poll(names).toEqual(['Eve', '小明', '王老师'])
  expect(drops('room-i').map(d => d.reason)).toEqual(['3 awareness state(s) of other clients or participants'])
})

it('archives a classroom with the key it was claimed with, frees it with its participants\' rooms, and refuses it afterwards', async () => {
  const presenter = await join('room-e', { claim: 'presenter-key' })
  // A later claim does not replace the first.
  const learner = await join('room-e', { claim: 'learner-key' })
  const own = await join('room-e.k7m2qx9a')
  presenter.doc.getMap('session').set('status', 'active')
  presenter.doc.getMap('store:questions').set('q1', { text: '为什么？' })
  await expect.poll(() => learner.doc.getMap('store:questions').size).toBe(1)
  const learnerClosed = providerClosed(learner.provider)
  const ownClosed = providerClosed(own.provider)

  const http = url.replace(/^ws/, 'http')
  for (const key of ['', 'learner-key']) expect((await fetch(`${http}/archive/room-e`, { method: 'POST', body: key })).status).toBe(403)
  expect(learner.doc.getMap('session').get('status')).toBe('active')
  const response = await fetch(`${http}/archive/room-e`, { method: 'POST', body: 'presenter-key' })
  expect(response.status).toBe(200)
  const { file } = await response.json() as { file: string }
  expect(file).toBe('.presmium/classroom/room-e.json')
  const archived = JSON.parse(readFileSync(joinPath(deck, file), 'utf8'))
  expect(archived.room).toBe('room-e')
  expect(archived.document.session).toMatchObject({ status: 'ended' })
  expect(archived.document['store:questions']).toEqual({ q1: { text: '为什么？' } })

  // Connected clients learn it and are closed for good, the participant's own room too.
  expect(await learnerClosed).toBe(4410)
  expect(await ownClosed).toBe(4410)
  expect(learner.doc.getMap('session').get('archive')).toBe(file)

  // The room is gone: joining it again is refused, and so is archiving it twice.
  const again = new WebsocketProvider(url, 'room-e', new Y.Doc(), { WebSocketPolyfill: WebSocket as never, disableBc: true })
  providers.push(again)
  expect(await providerClosed(again)).toBe(4410)
  expect((await fetch(`${http}/archive/room-e`, { method: 'POST', body: 'presenter-key' })).status).toBe(410)
  expect(existsSync(joinPath(deck, '.presmium/classroom/room-e.k7m2qx9a.json'))).toBe(false)
})
