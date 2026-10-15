// `presmium-classroom-server --port 0` as a real process, with y-websocket clients (as the session plugin uses) in rooms.
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { connect } from 'node:net'
import { tmpdir } from 'node:os'
import { join as joinPath } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest'
import WebSocket from 'ws'
import { WebsocketProvider } from 'y-websocket'
import * as Y from 'yjs'

const BIN = fileURLToPath(new URL('../bin/server.mjs', import.meta.url))
const deck = mkdtempSync(joinPath(tmpdir(), 'presmium-classroom-'))
const server = spawn(process.execPath, [BIN, '--port', '0', '--host', '127.0.0.1', '--deck', deck], { stdio: ['ignore', 'pipe', 'inherit'] })
let url = ''
const providers: WebsocketProvider[] = []

beforeAll(async () => {
  url = await new Promise<string>((resolve, reject) => {
    let output = ''
    server.stdout!.on('data', (chunk: Buffer) => {
      output += chunk
      const match = /^classroom server {2}(ws:\S+)$/m.exec(output)
      if (match) resolve(match[1]!)
    })
    server.once('exit', code => reject(new Error(`server exited (${code}): ${output}`)))
  })
})

// Each test's clients leave when it ends.
afterEach(() => providers.splice(0).forEach(p => p.destroy()))

afterAll(async () => {
  server.kill('SIGTERM')
  await new Promise(resolve => server.once('exit', resolve))
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

  expect(server.exitCode).toBeNull()
  const after = await join('room-c')
  expect(after.doc.getMap('session').get('status')).toBe('active')
})

/** An answer of participant `p` to quiz `q`, as the classroom plugin writes it. */
const answer = (q: string, p: string, choice: number) => [`${q}:${p}`, { quiz: q, participant: p, choice: [choice] }] as const

it('takes no more writes once the classroom has ended', async () => {
  const presenter = await join('room-d', { claim: 'presenter-key' })
  const learner = await join('room-d', { participant: 'p1', key: 'p1-key' })
  const answers = (doc: Y.Doc) => doc.getMap('store:answers')
  answers(learner.doc).set(...answer('q', 'p1', 0))
  presenter.doc.getMap('session').set('status', 'ended')
  await expect.poll(() => learner.doc.getMap('session').get('status')).toBe('ended')

  answers(learner.doc).set(...answer('q2', 'p1', 1))
  // The server has not applied the late write: a client that joins now reads the classroom without it.
  await new Promise(resolve => setTimeout(resolve, 200))
  const late = await join('room-d')
  expect(Object.keys(answers(late.doc).toJSON())).toEqual(['q:p1'])
})

it('takes the presenter\'s writes only from the presenter, and a learner\'s answers only under their own id (P-60)', async () => {
  const presenter = await join('room-f', { claim: 'presenter-key', participant: 'teacher', key: 'teacher-key' })
  const learner = await join('room-f', { participant: 'p1', key: 'p1-key' })
  // Someone who knows p1's id from the room, but not p1's key, is not p1.
  const impostor = await join('room-f', { participant: 'p1', key: 'guessed' })
  presenter.doc.getMap('session').set('status', 'active')
  await expect.poll(() => learner.doc.getMap('session').get('status')).toBe('active')

  // A learner's own answer counts.
  learner.doc.getMap('store:answers').set(...answer('s/quiz2', 'p1', 1))
  await expect.poll(() => presenter.doc.getMap('store:answers').has('s/quiz2:p1')).toBe(true)

  // A learner cannot end the classroom, nor open a quiz (each write from a connection of its own:
  // once an update is dropped, the writer's later updates wait for it in vain).
  const learners = await Promise.all([1, 2, 3, 4].map(() => join('room-f', { participant: 'p1', key: 'p1-key' })))
  learners[0]!.doc.getMap('session').set('status', 'ended')
  learners[1]!.doc.getMap('store:quizzes').set('s/quiz', { open: true })
  // Nor answer for another participant, under the other's id or with the other's id in the answer.
  learners[2]!.doc.getMap('store:answers').set(...answer('s/quiz', 'p2', 0))
  learners[3]!.doc.getMap('store:answers').set('s/quiz:p1', { quiz: 's/quiz', participant: 'p2', choice: [0] })
  impostor.doc.getMap('store:answers').set(...answer('s/other', 'p1', 2))

  await new Promise(resolve => setTimeout(resolve, 200))
  const late = await join('room-f')
  expect(late.doc.getMap('session').get('status')).toBe('active')
  expect(late.doc.getMap('store:quizzes').toJSON()).toEqual({})
  expect(late.doc.getMap('store:answers').toJSON()).toEqual({ 's/quiz2:p1': { quiz: 's/quiz2', participant: 'p1', choice: [1] } })

  // The presenter opens a quiz and ends the classroom.
  presenter.doc.getMap('store:quizzes').set('s/quiz', { open: true })
  presenter.doc.getMap('session').set('status', 'ended')
  await expect.poll(() => late.doc.getMap('session').get('status')).toBe('ended')
  expect(late.doc.getMap('store:quizzes').toJSON()).toEqual({ 's/quiz': { open: true } })
})

it('archives a classroom with the key it was claimed with, frees it with its participants\' rooms, and refuses it afterwards', async () => {
  const presenter = await join('room-e', { claim: 'presenter-key' })
  // A later claim does not replace the first.
  const learner = await join('room-e', { claim: 'learner-key' })
  const own = await join('room-e.k7m2qx9a')
  presenter.doc.getMap('session').set('status', 'active')
  presenter.doc.getMap('store:questions').set('q1', { text: '为什么？' })
  await expect.poll(() => learner.doc.getMap('store:questions').size).toBe(1)
  const closed = (provider: WebsocketProvider) => new Promise<number>(resolve => provider.once('closed', ({ code }: { code: number }) => resolve(code)))
  const learnerClosed = closed(learner.provider)
  const ownClosed = closed(own.provider)

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
  expect(await closed(again)).toBe(4410)
  expect((await fetch(`${http}/archive/room-e`, { method: 'POST', body: 'presenter-key' })).status).toBe(410)
  expect(existsSync(joinPath(deck, '.presmium/classroom/room-e.k7m2qx9a.json'))).toBe(false)
})
