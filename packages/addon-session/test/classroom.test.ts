import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { startClassroomServer } from '@lincyaw/classroom-server'
import { presmium } from '@lincyaw/cli/testing'
import { afterAll, expect, it } from 'vitest'
import { createClassroomConnection } from '../src/client/classroom-connection.ts'

const ADDON = fileURLToPath(new URL('..', import.meta.url))
const dir = mkdtempSync(join(tmpdir(), 'presmium-session-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

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
  const classroom = createClassroomConnection({ server: `ws://127.0.0.1:${port}`, base: 'http://localhost/deck/', timeoutMs })
  const joining = classroom.session.join('oldroom', '小明')
  const server = await startClassroomServer({ port, listenAddress: '127.0.0.1', deck: dir })
  try {
    classroom.session.leave()
    const room = await classroom.session.create('王老师')
    await joining
    await new Promise(resolve => setTimeout(resolve, timeoutMs + 500))
    expect(classroom.session.snapshot()).toMatchObject({ sessionId: room, status: 'active', connection: 'connected', me: { name: '王老师', role: 'presenter' }, error: undefined })
  } finally {
    classroom.dispose()
    await server.close()
  }
}, 15_000)

it('presmium check tells how to set up a classroom server for a published deck when the deck names none', async () => {
  writeFileSync(join(dir, 'lecture.md'), `---\nplugins:\n  - ${ADDON}\n---\n\n# Deck\n\nText.\n`)
  const { code, stdout } = await presmium(dir, ['check'])
  expect(code, stdout).toBe(0)
  expect(stdout).toMatch(/lecture\.md:\d+ +info +no classroom server: presmium dev and presmium serve sync the classroom on their own port; a build shows no classroom +\(presmium\.session\)/)
  expect(stdout).toContain('hint: for a published deck, start presmium-classroom-server')
})
