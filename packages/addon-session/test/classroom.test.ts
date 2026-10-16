// The session's classroom in Node against a real classroom server (`@presmium/classroom-server`),
// and the real `presmium check` on a deck that names no classroom server.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { startClassroomServer } from '@presmium/classroom-server'
import { presmium } from '@presmium/cli/testing'
import { afterAll, expect, it } from 'vitest'
import { createClassroom } from '../src/client/classroom.ts'

const ADDON = fileURLToPath(new URL('..', import.meta.url))
const dir = mkdtempSync(join(tmpdir(), 'presmium-session-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

/** A port nobody listens on, yet. */
async function freePort(): Promise<number> {
  const probe = createServer()
  await new Promise<void>(resolve => probe.listen(0, '127.0.0.1', resolve))
  const { port } = probe.address() as AddressInfo
  await new Promise(resolve => probe.close(resolve))
  return port
}

it('a join abandoned while the server was down leaves the classroom created after it alone (P-60)', async () => {
  const port = await freePort()
  const timeoutMs = 1500
  const classroom = createClassroom({ server: `ws://127.0.0.1:${port}`, base: 'http://localhost/deck/', timeoutMs })
  // The server is down: joining waits for it.
  const joining = classroom.session.join('oldroom', '小明')
  const server = await startClassroomServer({ port, host: '127.0.0.1', deck: dir })
  try {
    // Leaving, then creating a classroom, while the join still waits.
    classroom.session.leave()
    const room = await classroom.session.create('王老师')
    await joining
    // Past the time the abandoned join would have waited.
    await new Promise(resolve => setTimeout(resolve, timeoutMs + 500))
    expect(classroom.session.snapshot()).toMatchObject({ sessionId: room, status: 'active', connection: 'connected', me: { name: '王老师', role: 'presenter' }, error: undefined })
  } finally {
    classroom.dispose()
    await server.close()
  }
}, 15_000)

it('presmium check tells how to set up a classroom server when the deck names none', async () => {
  writeFileSync(join(dir, 'lecture.md'), `---\nplugins:\n  - ${ADDON}\n---\n\n# Deck\n\nText.\n`)
  const { code, stdout } = await presmium(dir, ['check'])
  expect(code, stdout).toBe(0)
  expect(stdout).toMatch(/lecture\.md:\d+ +info +no classroom server: the deck works alone, and its build shows no classroom +\(presmium\.session\)/)
  expect(stdout).toContain('hint: start presmium-classroom-server')
})
