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

afterEach(() => {
  providers.splice(0).forEach(p => p.destroy())
  sockets.splice(0).forEach(s => s.terminate())
})

afterAll(async () => {
  await server.close()
  rmSync(deck, { recursive: true, force: true })
})

async function join(room: string, params: Record<string, string> = {}): Promise<{ doc: Y.Doc, provider: WebsocketProvider }> {
  const doc = new Y.Doc()
  const provider = new WebsocketProvider(url, room, doc, { WebSocketPolyfill: WebSocket as never, disableBc: true, params })
  providers.push(provider)
  await new Promise<void>(resolve => provider.once('sync', () => resolve()))
  return { doc, provider }
}

async function socket(room: string, params: Record<string, string>): Promise<WebSocket> {
  const ws = new WebSocket(`${url}/${room}?${new URLSearchParams(params)}`)
  sockets.push(ws)
  await new Promise(resolve => ws.once('open', resolve))
  return ws
}

const closed = (ws: WebSocket) => new Promise<number>(resolve => ws.once('close', resolve))
const providerClosed = (provider: WebsocketProvider) => new Promise<number>(resolve => provider.once('closed', ({ code }: { code: number }) => resolve(code)))
const drops = (room: string) => dropped.filter(d => d.room === room)

function updateMessage(update: Uint8Array): Uint8Array {
  const encoder = encoding.createEncoder()
  encoding.writeVarUint(encoder, 0)
  syncProtocol.writeUpdate(encoder, update)
  return encoding.toUint8Array(encoder)
}

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

  const late = await join('room-a')
  expect(late.doc.getMap('session').get('status')).toBe('active')
  expect(other.doc.getMap('session').get('status')).toBeUndefined()

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
  await expect.poll(() => drops('room-d').map(d => d.reason)).toEqual(['an update after the classroom ended'])
  const late = await join('room-d')
  expect(Object.keys(answers(late.doc).toJSON())).toEqual(['q:p1'])
})

it('takes the presenter\'s writes only from the presenter, and a learner\'s entries only under their own id and of bounded size (P-60)', async () => {
  const presenter = await join('room-f', { claim: 'presenter-key', participant: 'teacher', key: 'teacher-key' })
  const learner = await join('room-f', { participant: 'p1', key: 'p1-key' })
  const impostor = await join('room-f', { participant: 'p1', key: 'guessed' })
  presenter.doc.getMap('session').set('status', 'active')
  await expect.poll(() => learner.doc.getMap('session').get('status')).toBe('active')

  learner.doc.getMap('store:answers').set(...answer('s/quiz2', 'p1', 1))
  await expect.poll(() => presenter.doc.getMap('store:answers').has('s/quiz2:p1')).toBe(true)

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
  learner.doc.getMap('store:answers').set(...answer('s/quiz3', 'p1', 0))
  await expect.poll(() => presenter.doc.getMap('store:answers').has('s/quiz3:p1')).toBe(true)
  const late = await join('room-f')
  expect(late.doc.getMap('session').get('status')).toBe('active')
  expect(late.doc.getMap('store:quizzes').toJSON()).toEqual({})
  expect(Object.keys(late.doc.getMap('store:answers').toJSON()).sort()).toEqual(['s/quiz2:p1', 's/quiz3:p1'])
  expect(late.doc.getMap('store:questions').toJSON()).toEqual({})

  presenter.doc.getMap('store:quizzes').set('s/quiz', { open: true })
  presenter.doc.getMap('session').set('status', 'ended')
  await expect.poll(() => late.doc.getMap('session').get('status')).toBe('ended')
  expect(late.doc.getMap('store:quizzes').toJSON()).toEqual({ 's/quiz': { open: true } })
})

it('finds the participant where its collection puts it in the key: a learner whose id is a part of a section id cannot overwrite nor delete another learner\'s answer, and is told so (F-27)', async () => {
  const presenter = await join('room-sec', { claim: 'presenter-key', participant: 'teacher', key: 'teacher-key' })
  const alice = await join('room-sec', { participant: 'alice', key: 'alice-key' })
  presenter.doc.getMap('session').set('status', 'active')
  await expect.poll(() => alice.doc.getMap('session').get('status')).toBe('active')
  alice.doc.getMap('store:answers').set(...answer('sec:intro/quiz-1', 'alice', 1))
  alice.doc.getMap('store:questions').set('alice:q1', { author: 'alice', text: '为什么？' })
  await expect.poll(() => presenter.doc.getMap('store:questions').has('alice:q1')).toBe(true)
  const own = presenter.doc.getMap('store:answers').get('sec:intro/quiz-1:alice')

  const sec = await join('room-sec', { participant: 'sec', key: 'sec-key' })
  sec.doc.getMap('store:answers').set(...answer('sec:intro/quiz-1', 'sec', 2))
  await expect.poll(() => presenter.doc.getMap('store:answers').has('sec:intro/quiz-1:sec')).toBe(true)
  presenter.doc.getMap('store:pulse').set('sec:intro/pulse-1:sec', { pulse: 'sec:intro/pulse-1', participant: 'alice', level: 1 })
  await expect.poll(() => sec.doc.getMap('store:pulse').has('sec:intro/pulse-1:sec')).toBe(true)
  const tries = await Promise.all([1, 2, 3, 4].map(() => join('room-sec', { participant: 'sec', key: 'sec-key' })))
  const closes = tries.map(t => providerClosed(t.provider))
  tries[0]!.doc.getMap('store:answers').set('sec:intro/quiz-1:alice', { quiz: 'sec:intro/quiz-1', participant: 'sec', choice: [3] })
  tries[1]!.doc.getMap('store:answers').delete('sec:intro/quiz-1:alice')
  tries[2]!.doc.getMap('store:questions').set('alice:q1', { author: 'sec', text: '改掉' })
  tries[3]!.doc.getMap('store:pulse').delete('sec:intro/pulse-1:sec')
  expect(await Promise.all(closes)).toEqual([4403, 4403, 4403, 4403])
  expect(drops('room-sec').map(d => [d.writer.participant, d.reason]).sort()).toEqual([
    ['sec', 'a change to another participant\'s entry in store:pulse'],
    ['sec', 'a write to store:answers under another participant\'s key'],
    ['sec', 'a write to store:answers under another participant\'s key'],
    ['sec', 'a write to store:questions under another participant\'s key'],
  ])

  const late = await join('room-sec')
  expect(late.doc.getMap('store:answers').get('sec:intro/quiz-1:alice')).toEqual(own)
  expect(late.doc.getMap('store:questions').get('alice:q1')).toEqual({ author: 'alice', text: '为什么？' })
})

function structAfter(client: number, clock: number, value: unknown): Uint8Array {
  const encoder = encoding.createEncoder()
  encoding.writeVarUint(encoder, 1)
  encoding.writeVarUint(encoder, 1)
  encoding.writeVarUint(encoder, 987654321)
  encoding.writeVarUint(encoder, 0)
  encoding.writeUint8(encoder, 0x80 | 8)
  encoding.writeVarUint(encoder, client)
  encoding.writeVarUint(encoder, clock)
  encoding.writeVarUint(encoder, 1)
  encoding.writeAny(encoder, value as never)
  encoding.writeVarUint(encoder, 0)
  return encoding.toUint8Array(encoder)
}

it('refuses a learner\'s update that would wait in the room, such as one deleting what the presenter writes next or placing a value after it (P-60, P-61)', async () => {
  const presenter = await join('room-g', { claim: 'presenter-key' })
  presenter.doc.getMap('session').set('status', 'active')
  const next = Y.getState(presenter.doc.store, presenter.doc.clientID)
  const future = new Y.Doc()
  future.clientID = presenter.doc.clientID
  Y.applyUpdate(future, Y.encodeStateAsUpdate(presenter.doc))
  for (let i = 0; i < 20; i++) future.getMap('scratch').set('x', i)
  future.getMap('scratch').delete('x')
  const forged = await socket('room-g', { participant: 'p1', key: 'p1-key' })
  const code = closed(forged)
  forged.send(updateMessage(Y.encodeStateAsUpdate(future, Y.encodeStateVector(future))))
  expect(await code).toBe(4403)
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
  await expect.poll(() => learner.provider.awareness.getStates().has(presenter.doc.clientID)).toBe(true)
  const forge = (choice: number) => {
    const forged = new Y.Doc()
    Y.applyUpdate(forged, Y.encodeStateAsUpdate(presenter.doc))
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

  presenter.doc.getMap('store:quizzes').set('q', { open: true })
  await expect.poll(() => learner.doc.getMap('store:quizzes').get('q')).toEqual({ open: true })
  const late = await join('room-j')
  expect(late.doc.getMap('session').get('status')).toBe('active')
  expect(late.doc.getMap('store:quizzes').get('q')).toEqual({ open: true })
  expect(late.doc.getMap('store:answers').toJSON()).toEqual({})
})

it('keeps the presenter\'s client, known from awareness only, as the presenter\'s while its connection is down: a learner can neither show it nor write as it (P-60, R-20)', async () => {
  const presenter = await join('room-k', { claim: 'presenter-key' })
  presenter.provider.awareness.setLocalStateField('participant', { id: 'teacher', name: '王老师', role: 'presenter' })
  const learner = await join('room-k', { participant: 'p1', key: 'p1-key' })
  await expect.poll(() => learner.provider.awareness.getStates().has(presenter.doc.clientID)).toBe(true)
  presenter.provider.disconnect()
  await expect.poll(() => learner.provider.awareness.getStates().has(presenter.doc.clientID)).toBe(false)

  const forged = new Y.Doc()
  forged.clientID = presenter.doc.clientID
  forged.getMap('store:answers').set(...answer('q', 'p1', 0))
  const attacker = await socket('room-k', { participant: 'p1', key: 'p1-key' })
  const code = closed(attacker)
  attacker.send(awarenessMessage([[presenter.doc.clientID, 100, { participant: { id: 'p1', name: '小明', role: 'learner' } }]]))
  attacker.send(updateMessage(Y.encodeStateAsUpdate(forged)))
  expect(await code).toBe(4403)
  expect(drops('room-k').map(d => d.reason)).toEqual(['1 awareness state(s) of other clients or participants', 'an update in the name of another writer\'s client'])

  presenter.provider.connect()
  await expect.poll(() => presenter.provider.synced).toBe(true)
  presenter.provider.awareness.setLocalStateField('participant', { id: 'teacher', name: '王老师', role: 'presenter' })
  presenter.doc.getMap('store:quizzes').set('q', { open: true })
  await expect.poll(() => learner.doc.getMap('store:quizzes').get('q')).toEqual({ open: true })
  await expect.poll(() => learner.provider.awareness.getStates().get(presenter.doc.clientID)?.participant?.name).toBe('王老师')
  const late = await join('room-k')
  expect(late.doc.getMap('store:quizzes').get('q')).toEqual({ open: true })
  expect(late.doc.getMap('store:answers').toJSON()).toEqual({})
  expect(drops('room-k')).toHaveLength(2)
})

it('closes the connection of a refused update, leaves nothing of it in the room, and takes the learner\'s writes again once the client starts over (F-27)', async () => {
  const presenter = await join('room-h', { claim: 'presenter-key' })
  const learner = await join('room-h', { participant: 'p1', key: 'p1-key' })
  const code = providerClosed(learner.provider)
  learner.doc.getMap('store:quizzes').set('q', { open: true })
  expect(await code).toBe(4403)
  const other = await join('room-h', { participant: 'p1', key: 'p1-key' })
  const otherCode = providerClosed(other.provider)
  other.doc.getMap('store:p1-junk').set('x', 1)
  expect(await otherCode).toBe(4403)
  const again = await join('room-h', { participant: 'p1', key: 'p1-key' })
  again.doc.getMap('store:answers').set(...answer('q', 'p1', 1))
  await expect.poll(() => presenter.doc.getMap('store:answers').get('q:p1')).toEqual({ quiz: 'q', participant: 'p1', choice: [1] })
  expect(presenter.doc.getMap('store:quizzes').toJSON()).toEqual({})
  const response = await fetch(`${url.replace(/^ws/, 'http')}/archive/room-h`, { method: 'POST', body: 'presenter-key' })
  const { file } = await response.json() as { file: string }
  expect(Object.keys(JSON.parse(readFileSync(joinPath(deck, file), 'utf8')).document).sort()).toEqual(['session', 'store:answers'])
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
    [presenter.doc.clientID, 1000, null],
    [424242, 1, { participant: { id: 'p0', name: '冒充的主讲', role: 'presenter' } }],
    [learner.doc.clientID, 1000, { participant: { id: 'p1', name: '改掉的名字', role: 'learner' } }],
  ]))
  attacker.send(awarenessMessage([[424242, 2, { participant: { id: 'p2', name: 'Eve', role: 'learner' } }]]))
  await expect.poll(names).toEqual(['Eve', '小明', '王老师'])
  expect(drops('room-i').map(d => d.reason)).toEqual(['3 awareness state(s) of other clients or participants'])
})

it('archives a classroom with the key it was claimed with, frees it with its participants\' rooms, and refuses it afterwards', async () => {
  const presenter = await join('room-e', { claim: 'presenter-key' })
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

  expect(await learnerClosed).toBe(4410)
  expect(await ownClosed).toBe(4410)
  expect(learner.doc.getMap('session').get('archive')).toBe(file)

  const again = new WebsocketProvider(url, 'room-e', new Y.Doc(), { WebSocketPolyfill: WebSocket as never, disableBc: true })
  providers.push(again)
  expect(await providerClosed(again)).toBe(4410)
  expect((await fetch(`${http}/archive/room-e`, { method: 'POST', body: 'presenter-key' })).status).toBe(410)
  expect(existsSync(joinPath(deck, '.presmium/classroom/room-e.k7m2qx9a.json'))).toBe(false)
})
