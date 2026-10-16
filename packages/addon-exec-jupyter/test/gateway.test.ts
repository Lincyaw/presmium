// The remote environments in `presmium gateway` (D13, WP-76): with the operator's pair
// PRESMIUM_ENV_GPU_URL and _TOKEN in the gateway's environment, `presmium.execJupyter/env/gpu/`
// proxies HTTP and WebSocket to that address with that token, for tokens that reach the plugin;
// the caller never sees the token; an environment without an address has no proxy.
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import WebSocket from 'ws'
import type { Child, Listener } from './helpers.ts'
import { cleanEnv, listener, PACKAGE, presmiumProcess, remove, waitFor } from './helpers.ts'

const SERVICE = 'gateway-service-token-of-serve'
const TOKEN = 'jupyter-token-only-the-gateway-holds'
let dir: string
let jupyter: Listener
let gateway: Child
let url: string

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'presmium-jupyter-gateway-'))
  mkdirSync(join(dir, 'node_modules/@presmium'), { recursive: true })
  symlinkSync(PACKAGE, join(dir, 'node_modules/@presmium/slidev-addon-exec-jupyter'), 'junction')
  writeFileSync(join(dir, 'presmium.workspace.yaml'), 'settings:\n  presmium.workspace:\n    plugins: ["@presmium/slidev-addon-exec-jupyter"]\n')
  jupyter = await listener()
  gateway = presmiumProcess(dir, ['gateway', '.', '--port', '0', '--operator-dir', join(dir, 'operator')], cleanEnv({
    PRESMIUM_GATEWAY_TOKEN: SERVICE,
    PRESMIUM_ENV_GPU_URL: jupyter.url,
    PRESMIUM_ENV_GPU_TOKEN: TOKEN,
  }))
  url = (await waitFor(gateway, /^gateway {2}(http\S+)$/m, 120_000))[1]!
}, 180_000)

afterAll(async () => {
  await gateway?.stop()
  await jupyter?.close()
  remove(dir)
})

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` })

async function scoped(plugins: string[]): Promise<string> {
  const response = await fetch(`${url}/tokens`, { method: 'POST', headers: { ...bearer(SERVICE), 'Content-Type': 'application/json' }, body: JSON.stringify({ plugins, purpose: 'run:doc' }) })
  expect(response.status).toBe(201)
  return ((await response.json()) as { token: string }).token
}

it('proxies env/gpu with the operator\'s token for a token that reaches the plugin, HTTP and WebSocket; others get 403, an environment without an address 404', async () => {
  expect(gateway.output()).toMatch(/^plugins {2}.*presmium\.execJupyter/m)
  const token = await scoped(['presmium.execJupyter'])
  const response = await fetch(`${url}/presmium.execJupyter/env/gpu/api/kernelspecs`, { headers: bearer(token) })
  expect(response.status).toBe(200)
  const answer = `${JSON.stringify([...response.headers])}${await response.text()}`
  expect(answer).toContain('kernelspecs')
  expect(answer).not.toContain(TOKEN)
  expect(jupyter.received).toHaveLength(1)
  expect(jupyter.received[0]).toMatchObject({ method: 'GET', url: '/api/kernelspecs', headers: { authorization: `token ${TOKEN}` } })

  // The kernels' WebSocket goes the same way.
  await new Promise<void>((resolve) => {
    const socket = new WebSocket(`${url.replace(/^http/, 'ws')}/presmium.execJupyter/env/gpu/api/kernels/k1/channels`, { headers: bearer(token) })
    socket.on('unexpected-response', () => resolve())
    socket.on('error', () => resolve())
  })
  expect(jupyter.received[1]).toMatchObject({ upgrade: true, url: '/api/kernels/k1/channels', headers: { authorization: `token ${TOKEN}` } })

  const other = await scoped(['presmium.speech'])
  expect((await fetch(`${url}/presmium.execJupyter/env/gpu/api/kernelspecs`, { headers: bearer(other) })).status).toBe(403)
  expect((await fetch(`${url}/presmium.execJupyter/env/cpu/api/kernelspecs`, { headers: bearer(SERVICE) })).status).toBe(404)
  expect(jupyter.received).toHaveLength(2)
})
