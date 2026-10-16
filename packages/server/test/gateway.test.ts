// `presmium gateway` (D13, docs/architecture.md 10.9): the operator's plugin's gateway routes behind
// the service token and scoped tokens, the checks of Host and Origin, `/mcp` forwarded to serve, and
// listening on this machine by default.
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { connect } from 'node:net'
import { networkInterfaces, tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { Child } from './helpers.ts'
import { cleanEnv, FIXTURES, listener, presmiumProcess, raw, remove, waitFor } from './helpers.ts'

const SERVICE = 'gateway-service-token'
let dir: string
let gateway: Child
let url: string
let serve: Awaited<ReturnType<typeof listener>>

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'presmium-gateway-'))
  mkdirSync(join(dir, 'node_modules'))
  cpSync(join(FIXTURES, 'gateway-plugin'), join(dir, 'node_modules/presmium-fixture-gateway'), { recursive: true })
  writeFileSync(join(dir, 'presmium.workspace.yaml'), [
    'settings:',
    '  presmium.workspace:',
    '    plugins: [presmium-fixture-gateway]',
    '  fixture.gateway:',
    '    region: test',
    '',
  ].join('\n'))
  serve = await listener()
  gateway = presmiumProcess(dir, ['gateway', '.', '--serve', serve.url, '--port', '0', '--operator-dir', join(dir, 'operator')],
    cleanEnv({ PRESMIUM_GATEWAY_TOKEN: SERVICE, TEST_UPSTREAM_KEY: 'upstream-credential' }))
  url = (await waitFor(gateway, /^gateway {2}(http\S+)$/m, 120_000))[1]!
}, 180_000)

afterAll(async () => {
  await gateway?.stop()
  await serve?.close()
  remove(dir)
})

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` })

it('mounts the operator plugin\'s routes behind the service token, checks Host and Origin, and listens on this machine', async () => {
  expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
  expect(gateway.output()).toMatch(/^plugins {2}fixture\.gateway$/m)
  expect((await raw(`${url}/fixture.gateway/grant`)).status).toBe(401)
  const served = await raw(`${url}/fixture.gateway/grant`, { headers: bearer(SERVICE) })
  expect(served.status).toBe(200)
  expect(served.json()).toMatchObject({ grant: { kind: 'service', plugins: ['fixture.gateway'] }, upstream: true, settings: { region: 'test' }, operatorDir: join(dir, 'operator') })
  expect(served.text).not.toContain('upstream-credential')

  expect((await raw(`${url}/fixture.gateway/grant`, { headers: { ...bearer(SERVICE), Host: 'evil.example' } })).status).toBe(403)
  expect((await raw(`${url}/fixture.gateway/grant`, { headers: { ...bearer(SERVICE), Origin: 'http://127.0.0.1' } })).status).toBe(403)

  // Not on the machine's other addresses.
  const external = Object.values(networkInterfaces()).flat().find(address => address && address.family === 'IPv4' && !address.internal)
  if (external) {
    const port = Number(new URL(url).port)
    const reached = await new Promise<boolean>((resolve) => {
      const socket = connect(port, external.address, () => {
        socket.destroy()
        resolve(true)
      })
      socket.on('error', () => resolve(false))
    })
    expect(reached).toBe(false)
  }
})

it('issues scoped tokens that reach their plugins only, revokes them, and forwards /mcp to serve as it is', async () => {
  const issue = async (plugins: string[], token = SERVICE) => raw(`${url}/tokens`, {
    method: 'POST',
    headers: { ...bearer(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ plugins, purpose: 'run:doc', member: 'editor@test' }),
  })
  const other = (await issue(['fixture.other'])).json<{ token: string }>()
  expect((await raw(`${url}/fixture.gateway/grant`, { headers: bearer(other.token) })).status).toBe(403)

  const issued = await issue(['fixture.gateway'])
  expect(issued.status).toBe(201)
  const scoped = issued.json<{ id: string, token: string }>()
  const granted = await raw(`${url}/fixture.gateway/grant`, { headers: bearer(scoped.token) })
  expect(granted.status).toBe(200)
  expect(granted.json()).toMatchObject({ grant: { kind: 'scoped', plugins: ['fixture.gateway'], purpose: 'run:doc', member: 'editor@test' } })
  // A route for the service token only; a scoped token issues no tokens.
  expect((await raw(`${url}/fixture.gateway/service`, { headers: bearer(scoped.token) })).status).toBe(403)
  expect((await raw(`${url}/fixture.gateway/service`, { headers: bearer(SERVICE) })).status).toBe(200)
  expect((await issue(['fixture.gateway'], scoped.token)).status).toBe(403)

  expect((await raw(`${url}/tokens/${scoped.id}`, { method: 'DELETE', headers: bearer(SERVICE) })).status).toBe(204)
  expect((await raw(`${url}/fixture.gateway/grant`, { headers: bearer(scoped.token) })).status).toBe(401)

  // /mcp: as it is, its token too (serve checks it).
  const mcp = await raw(`${url}/mcp`, { method: 'POST', headers: { 'Authorization': 'Bearer mcp-session-token', 'Content-Type': 'application/json' }, body: '{"jsonrpc":"2.0"}' })
  expect(mcp.json()).toMatchObject({ listener: true, path: '/mcp' })
  expect(serve.requests.at(-1)).toMatchObject({ method: 'POST', path: '/mcp', body: '{"jsonrpc":"2.0"}' })
  expect(serve.requests.at(-1)!.headers.authorization).toBe('Bearer mcp-session-token')
})
