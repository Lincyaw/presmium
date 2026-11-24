import { startClassroomServer } from '@lincyaw/classroom-server'
import { mkdtempSync, rmSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
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

it('a join abandoned while the server was down leaves the classroom created after it alone', async () => {
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
