// `presmium-classroom-server --port 0` as a real process, with y-websocket clients (as the session plugin uses) in rooms.
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, expect, it } from 'vitest'
import WebSocket from 'ws'
import { WebsocketProvider } from 'y-websocket'
import * as Y from 'yjs'

const BIN = fileURLToPath(new URL('../bin/server.mjs', import.meta.url))
const server = spawn(process.execPath, [BIN, '--port', '0', '--host', '127.0.0.1'], { stdio: ['ignore', 'pipe', 'inherit'] })
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

afterAll(async () => {
  providers.forEach(p => p.destroy())
  server.kill('SIGTERM')
  await new Promise(resolve => server.once('exit', resolve))
})

/** A client document in a room, once it has synced with the server. */
async function join(room: string): Promise<{ doc: Y.Doc, provider: WebsocketProvider }> {
  const doc = new Y.Doc()
  const provider = new WebsocketProvider(url, room, doc, { WebSocketPolyfill: WebSocket as never, disableBc: true })
  providers.push(provider)
  await new Promise<void>(resolve => provider.once('sync', () => resolve()))
  return { doc, provider }
}

it('syncs the documents of a room, keeps them for late joiners, and keeps rooms apart', async () => {
  const a = await join('room-a')
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
