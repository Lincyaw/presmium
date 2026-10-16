// The server (WP-73a, docs/architecture.md section 10): `presmium dev` mounts a test plugin's routes,
// which the web dev server proxies, and keeps other machines and sites out; the `serve` mode with a
// login (SHARED) takes members from the login proxy, dispatches approvals by scope, keeps the owner's
// operations on the owner console, reads its tokens from files and refuses to start without the
// gateway, agent-host and console, or with third-party credentials.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Child, EventStream } from './helpers.ts'
import { eventStream, FIXTURES, listener, presmiumProcess, raw, remove, serveHost, waitFor, workspace } from './helpers.ts'

const DECK = join(FIXTURES, 'deck')

describe('presmium dev', () => {
  let dir: string
  let dev: Child
  let web: string
  let server: string
  beforeAll(async () => {
    dir = workspace('server-dev', { '.': DECK })
    dev = presmiumProcess(dir, ['dev', '--to', 'web', '--allow', 'operate'])
    web = (await waitFor(dev, /^web {2}(http\S+)$/m))[1]!.replace(/\/$/, '')
    server = (await waitFor(dev, /^server {2}(http\S+)$/m))[1]!
  }, 300_000)
  afterAll(async () => {
    await dev?.stop()
    remove(dir)
  })

  it('serves a plugin\'s route through the web dev server, and keeps other hosts, sites and token-less MCP clients out', async () => {
    // The route returns the value of the plugin's own Node service.
    const value = await fetch(`${web}/__presmium/fixture.server/value`)
    expect(value.status).toBe(200)
    expect(await value.json()).toEqual({ value: 'from the node service' })

    // DNS rebinding and other sites: another Host, another Origin.
    expect((await raw(`${server}/__presmium/fixture.server/value`, { headers: { Host: 'evil.example' } })).status).toBe(403)
    expect((await raw(`${server}/__presmium/fixture.server/value`, { headers: { Origin: 'https://evil.example' } })).status).toBe(403)
    // A page of the dev server (another port of this machine) is welcome.
    expect((await raw(`${server}/__presmium/fixture.server/value`, { headers: { Origin: web } })).status).toBe(200)

    // /mcp needs the token; the per-process one is in .presmium/server.json (0600). MCP itself comes with WP-78.
    expect((await raw(`${server}/mcp`, { method: 'POST' })).status).toBe(401)
    const state = JSON.parse(readFileSync(join(dir, '.presmium/server.json'), 'utf8')) as { token: string, url: string }
    expect(state.url).toBe(server)
    expect((await raw(`${server}/mcp`, { method: 'POST', headers: { Authorization: `Bearer ${state.token}` } })).status).toBe(501)

    // `--allow operate`: the route's approval is given without asking.
    const approved = await fetch(`${web}/__presmium/fixture.server/approve`, { method: 'POST' })
    expect(await approved.json()).toEqual({ allowed: true })
  })

  it('gives the plugin the operator\'s settings of presmium.workspace.yaml, and the deck\'s configuration only as config', async () => {
    const context = await (await fetch(`${web}/__presmium/fixture.server/context`)).json() as Record<string, any>
    const operator = { mode: 'operator', quota: 3 }
    const deck = { greeting: '来自文稿', mode: 'deck' }
    expect(context.trust).toBe('local')
    expect(context.settings).toEqual(operator)
    expect(context.service.settings).toEqual(operator)
    expect(context.config).toEqual(deck)
    expect(context.service.config).toEqual(deck)
    // LOCAL: the operator directory lies outside the workspace.
    expect(context.operatorDir).toMatch(/presmium\/operator\/[0-9a-f]{16}$/)
    expect(context.operatorDir.startsWith(dir)).toBe(false)
  })
})

/** The environment of a SHARED serve: the login proxy's secret, the gateway, agent-host and console. */
function sharedEnv(dir: string, gateway: string, agentHost: string, extra: Record<string, string> = {}): Record<string, string> {
  return {
    SERVE_WORKSPACE: dir,
    SERVE_ROLES: JSON.stringify({ 'owner@test': ['owner'], 'editor@test': ['editor'] }),
    PRESMIUM_PROXY_SECRET: 'proxy-secret',
    PRESMIUM_GATEWAY_URL: gateway,
    PRESMIUM_GATEWAY_TOKEN: 'gateway-token',
    PRESMIUM_AGENT_HOST_URL: agentHost,
    PRESMIUM_AGENT_HOST_TOKEN: 'agent-host-token',
    PRESMIUM_CONSOLE_HOST: 'console.test',
    ...extra,
  }
}

/** Headers of a request through the login proxy, to the site or the console. */
function as(email: string | undefined, host = 'site.test', extra: Record<string, string> = {}): Record<string, string> {
  return { 'Host': host, 'X-Presmium-Proxy-Secret': 'proxy-secret', ...email ? { 'X-Forwarded-Email': email } : {}, 'Presmium-Document': 'doc', ...extra }
}

describe('presmium serve with a login (SHARED)', () => {
  let dir: string
  let host: Child
  let url: string
  const listeners: Awaited<ReturnType<typeof listener>>[] = []
  beforeAll(async () => {
    dir = workspace('server-shared', { doc: DECK })
    writeFileSync(join(dir, 'presmium.workspace.yaml'), readFileSync(join(DECK, 'presmium.workspace.yaml')))
    const [gateway, agentHost, site] = await Promise.all([listener(), listener(), listener()])
    listeners.push(gateway, agentHost, site)
    const started = await serveHost(sharedEnv(dir, gateway.url, agentHost.url, { SERVE_FORWARD: site.url }))
    if (!started.url) throw new Error(started.error)
    host = started.host
    url = started.url
  }, 120_000)
  afterAll(async () => {
    await host?.stop()
    await Promise.all(listeners.map(l => l.close()))
    remove(dir)
  })

  it('takes members from the login proxy and checks the routes\' roles', async () => {
    expect((await raw(`${url}/__presmium/fixture.server/reader`, { headers: { Host: 'site.test', 'X-Forwarded-Email': 'reader@test' } })).status).toBe(403)
    expect((await raw(`${url}/__presmium/fixture.server/reader`, { headers: as('reader@test', 'site.test', { 'X-Presmium-Proxy-Secret': 'wrong' }) })).status).toBe(403)
    // A member the workspace does not name is a reader.
    expect((await raw(`${url}/__presmium/fixture.server/editor`, { headers: as('reader@test') })).status).toBe(403)
    const reader = await raw(`${url}/__presmium/fixture.server/reader`, { headers: as('reader@test') })
    expect(reader.status).toBe(200)
    expect(reader.json().member).toMatchObject({ id: 'reader@test', roles: ['reader'] })
    expect((await raw(`${url}/__presmium/fixture.server/editor`, { headers: as('editor@test') })).status).toBe(200)

    // SHARED, and no third-party credentials for the plugins.
    const context = (await raw(`${url}/__presmium/fixture.server/context`, { headers: as('reader@test') })).json()
    expect(context).toMatchObject({ trust: 'shared', secret: null, operatorDir: null })

    // The other paths go to the member's site.
    const page = await raw(`${url}/doc/`, { headers: as('reader@test') })
    expect(page.json()).toMatchObject({ listener: true, path: '/doc/' })
    expect(listeners[2]!.requests.at(-1)!.headers['x-presmium-proxy-secret']).toBeUndefined()
  })

  it('sends a workspace approval to the owner console only, and takes the answer from the console\'s own page only', async () => {
    const streams: EventStream[] = []
    try {
      const control = '/__presmium/presmium.server/control'
      const consoleStream = await eventStream(`${url}${control}?window=console-1`, as('owner@test', 'console.test'))
      const ownerSite = await eventStream(`${url}${control}?window=site-owner`, as('owner@test'))
      const editorSite = await eventStream(`${url}${control}?window=site-editor`, as('editor@test'))
      streams.push(consoleStream, ownerSite, editorSite)
      await Promise.all(streams.map(s => s.next('ready')))

      // The editor's route asks for an approval of workspace scope.
      const asked = raw(`${url}/__presmium/fixture.server/approve?scope=workspace`, { method: 'POST', headers: as('editor@test') })
      const { id } = await consoleStream.next('approval') as { id: string }
      // The owner's site window learns only how many wait, and where.
      expect(await ownerSite.next('pending')).toEqual({ count: 1, console: expect.stringMatching(/^\/\/console\.test(:\d+)?\/$/) })
      await new Promise(done => setTimeout(done, 300))
      expect(ownerSite.events.map(e => e.event)).not.toContain('approval')
      expect(editorSite.events.map(e => e.event)).not.toContain('approval')

      const answer = (headers: Record<string, string>) => raw(`${url}${control}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ type: 'answer', id, allow: true }),
      })
      // The editor who asked cannot answer it; nor the owner on the site; nor a request to the console
      // from the site's origin, or without the console's header.
      expect((await answer(as('editor@test'))).status).toBe(403)
      expect((await answer(as('owner@test', 'site.test', { Origin: 'http://site.test' }))).status).toBe(403)
      expect((await answer(as('owner@test', 'console.test', { 'Origin': 'http://site.test', 'Presmium-Console': '1' }))).status).toBe(403)
      expect((await answer(as('owner@test', 'console.test', { Origin: 'http://console.test' }))).status).toBe(403)
      // The console's own page.
      expect((await answer(as('owner@test', 'console.test', { 'Origin': 'http://console.test', 'Presmium-Console': '1' }))).status).toBe(200)
      expect((await asked).json()).toEqual({ allowed: true })
    } finally {
      streams.forEach(s => s.close())
    }
  })

  it('mounts owner routes on the console only, which shows no document and cannot be framed', async () => {
    expect((await raw(`${url}/__presmium/fixture.server/owner`, { headers: as('owner@test') })).status).toBe(404)
    const owner = await raw(`${url}/__presmium/fixture.server/owner`, { headers: as('owner@test', 'console.test') })
    expect(owner.status).toBe(200)
    expect(owner.json()).toEqual({ ok: true, owner: true })
    // Only owners use the console.
    expect((await raw(`${url}/__presmium/fixture.server/owner`, { headers: as('editor@test', 'console.test') })).status).toBe(403)

    // A document's page on the console's host name is not forwarded to the site.
    const before = listeners[2]!.requests.length
    const page = await raw(`${url}/doc/`, { headers: as('owner@test', 'console.test') })
    expect(page.status).toBe(404)
    expect(page.headers['content-security-policy']).toContain(`frame-ancestors 'none'`)
    expect(listeners[2]!.requests.length).toBe(before)
    const home = await raw(`${url}/`, { headers: as('owner@test', 'console.test') })
    expect(home.status).toBe(200)
    expect(home.headers['content-security-policy']).toBe(`default-src 'self'; frame-ancestors 'none'`)
    expect(home.text).not.toContain('服务端测试文稿')
    // No MCP on the console.
    expect((await raw(`${url}/mcp`, { headers: as('owner@test', 'console.test') })).status).toBe(404)
  })
})

describe('SHARED mode\'s secrets and refusals (D13)', () => {
  let dir: string
  const listeners: Awaited<ReturnType<typeof listener>>[] = []
  beforeAll(async () => {
    dir = workspace('server-refusals', { doc: DECK })
    listeners.push(await listener(), await listener())
  })
  afterAll(async () => {
    await Promise.all(listeners.map(l => l.close()))
    remove(dir)
  })

  it('reads its three tokens from files, so they are not in its environment, and reaches the gateway and agent-host with them', async () => {
    const [gateway, agentHost] = listeners as [Awaited<ReturnType<typeof listener>>, Awaited<ReturnType<typeof listener>>]
    const secrets = { PRESMIUM_GATEWAY_TOKEN: 'file-gateway-token', PRESMIUM_AGENT_HOST_TOKEN: 'file-agent-host-token', PRESMIUM_PROXY_SECRET: 'file-proxy-secret' }
    const files: Record<string, string> = {}
    for (const [name, value] of Object.entries(secrets)) {
      const file = join(dir, `${name.toLowerCase()}.txt`)
      writeFileSync(file, `${value}\n`, { mode: 0o600 })
      files[`${name}_FILE`] = file
    }
    const env = sharedEnv(dir, gateway.url, agentHost.url, files)
    delete (env as Record<string, string | undefined>).PRESMIUM_GATEWAY_TOKEN
    delete (env as Record<string, string | undefined>).PRESMIUM_AGENT_HOST_TOKEN
    delete (env as Record<string, string | undefined>).PRESMIUM_PROXY_SECRET
    const { host, url, error } = await serveHost(env)
    try {
      expect(error).toBeUndefined()
      const environ = readFileSync(`/proc/${host.child.pid}/environ`, 'utf8')
      for (const value of Object.values(secrets)) expect(environ).not.toContain(value)
      expect(gateway.requests.find(r => r.path === '/info')?.headers.authorization).toBe('Bearer file-gateway-token')
      expect(agentHost.requests.find(r => r.path === '/v1/info')?.headers.authorization).toBe('Bearer file-agent-host-token')
      const reader = await raw(`${url}/__presmium/fixture.server/reader`, { headers: { 'Host': 'site.test', 'X-Presmium-Proxy-Secret': 'file-proxy-secret', 'X-Forwarded-Email': 'a@test', 'Presmium-Document': 'doc' } })
      expect(reader.status).toBe(200)
    } finally {
      await host.stop()
    }
  })

  it('refuses to start without the gateway, agent-host or console, with a third-party credential, or beyond this machine without a login', async () => {
    const [gateway, agentHost] = listeners as [Awaited<ReturnType<typeof listener>>, Awaited<ReturnType<typeof listener>>]
    const loginOnly = await serveHost({ SERVE_WORKSPACE: dir, PRESMIUM_PROXY_SECRET: 'proxy-secret' })
    expect(loginOnly.error).toMatch(/PRESMIUM_GATEWAY_URL, PRESMIUM_GATEWAY_TOKEN, PRESMIUM_AGENT_HOST_URL, PRESMIUM_AGENT_HOST_TOKEN, PRESMIUM_CONSOLE_HOST/)

    const noConsole = sharedEnv(dir, gateway.url, agentHost.url)
    delete (noConsole as Record<string, string | undefined>).PRESMIUM_CONSOLE_HOST
    expect((await serveHost(noConsole)).error).toMatch(/missing: PRESMIUM_CONSOLE_HOST$/)

    const credential = await serveHost(sharedEnv(dir, gateway.url, agentHost.url, { OPENAI_API_KEY: 'sk-test-credential' }))
    expect(credential.error).toMatch(/OPENAI_API_KEY/)
    expect(credential.error).not.toContain('sk-test-credential')

    const unprotected = await serveHost({ SERVE_WORKSPACE: dir, SERVE_HOST: '0.0.0.0' })
    expect(unprotected.error).toMatch(/only behind a login proxy/)

    // Without the credential it starts, in SHARED mode, and the plugin sees no OPENAI_API_KEY.
    const ok = await serveHost(sharedEnv(dir, gateway.url, agentHost.url))
    try {
      expect(ok.error).toBeUndefined()
      const context = (await raw(`${ok.url}/__presmium/fixture.server/context`, { headers: as('reader@test') })).json()
      expect(context).toMatchObject({ trust: 'shared', secret: null })
    } finally {
      await ok.host.stop()
    }
  })
})
