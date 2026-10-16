// SHARED serve behind a real `presmium gateway` (D13, docs/architecture.md 10.3, 10.9): an agent's MCP
// client reaches serve's /mcp through the gateway with its MCP token alone, without the login proxy; and a
// plugin's proxy from serve to the gateway (an `auth: proxy` environment) works for a browser's request,
// whose Origin serve leaves out, since the gateway takes no request that has one.
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { Child } from './helpers.ts'
import { as, cleanEnv, FIXTURES, freePort, listener, presmiumProcess, raw, remove, serveHost, sharedEnv, waitFor, workspace } from './helpers.ts'

const DECK = join(FIXTURES, 'deck')
let dir: string
let serve: Child
let serveUrl: string
let gateway: Child
let gatewayUrl: string
let agentHost: Awaited<ReturnType<typeof listener>>
const clients: Client[] = []

beforeAll(async () => {
  dir = workspace('server-gateway', { doc: DECK })
  // The operator's plugin with gateway routes, installed at the workspace root and listed (D14).
  mkdirSync(join(dir, 'node_modules'))
  cpSync(join(FIXTURES, 'gateway-plugin'), join(dir, 'node_modules/presmium-fixture-gateway'), { recursive: true })
  writeFileSync(join(dir, 'presmium.workspace.yaml'), `${readFileSync(join(DECK, 'presmium.workspace.yaml'), 'utf8')}  presmium.workspace:\n    plugins: [presmium-fixture-gateway]\n`)
  // serve names the gateway's address in its MCP tokens, and the gateway serve's: the gateway's port comes first.
  gatewayUrl = `http://127.0.0.1:${await freePort()}`
  agentHost = await listener()
  const started = await serveHost(sharedEnv(dir, gatewayUrl, agentHost.url))
  if (!started.url) throw new Error(started.error)
  serve = started.host
  serveUrl = started.url
  gateway = presmiumProcess(dir, ['gateway', '.', '--serve', serveUrl, '--port', new URL(gatewayUrl).port, '--operator-dir', join(dir, 'operator')], cleanEnv({ PRESMIUM_GATEWAY_TOKEN: 'gateway-token' }))
  await waitFor(gateway, /^gateway {2}http\S+$/m, 120_000)
}, 180_000)

afterAll(async () => {
  for (const client of clients) await client.close().catch(() => undefined)
  await gateway?.stop()
  await serve?.stop()
  await agentHost?.close()
  remove(dir)
})

it('lets an agent reach serve\'s /mcp through the gateway with its MCP token, and no login proxy', async () => {
  // An agent session's token for an editor, as the assistant issues it (MCP_ENDPOINT): its address is the gateway's.
  const issued = (await raw(`${serveUrl}/__presmium/fixture.server/mcp`, { method: 'POST', headers: as('editor@test') })).json<{ url: string, token: string }>()
  expect(issued.url).toBe(`${gatewayUrl}/mcp`)
  expect((await raw(issued.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status).toBe(401)

  const client = new Client({ name: 'presmium-test', version: '0.1.0' }, { versionNegotiation: { mode: 'auto' } })
  clients.push(client)
  await client.connect(new StreamableHTTPClientTransport(new URL(issued.url), { requestInit: { headers: { Authorization: `Bearer ${issued.token}` } } }))
  expect(client.getInstructions()).toContain('presmium serve compiles a document again when its files change')
  expect(client.getInstructions()).toContain('in the page, or in the owner console')
  const sections = await client.callTool({ name: 'list_sections', arguments: {} })
  const text = (sections.content as { text: string }[])[0]!.text
  expect(JSON.parse(text).sections.map((s: { title: string }) => s.title)).toEqual(['服务端测试文稿', '第二节'])

  // The owner console has no MCP, token or not.
  expect((await raw(`${serveUrl}/mcp`, { headers: as('owner@test', 'console.test', { Authorization: `Bearer ${issued.token}` }) })).status).toBe(404)
})

it('passes a browser\'s request through a plugin\'s proxy to the gateway without its Origin', async () => {
  const page = await raw(`${serveUrl}/__presmium/fixture.server/gateway/fixture.gateway/grant`, {
    method: 'POST',
    headers: as('reader@test', 'site.test', { 'Origin': 'http://site.test', 'Content-Type': 'application/json' }),
    body: '{}',
  })
  expect(page.status, page.text).toBe(200)
  expect(page.json()).toMatchObject({ grant: { kind: 'service', plugins: ['fixture.gateway'] } })
  // The gateway itself still refuses a request with an Origin.
  expect((await raw(`${gatewayUrl}/fixture.gateway/grant`, { headers: { Authorization: 'Bearer gateway-token', Origin: 'http://site.test' } })).status).toBe(403)
})
