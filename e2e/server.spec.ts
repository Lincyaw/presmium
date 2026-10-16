// The server in the browser (WP-73a, docs/architecture.md section 10): a component reaches its
// plugin's route through useServer() under `presmium dev` and degrades in static output; an approval
// the route asks for shows in the toolbar; in SHARED mode the deck's code in an owner's page cannot
// answer a workspace approval, which only the owner console answers; the IR runtime reports and
// replays `go`; the presenter window shows the marks of roles without children.
import { spawn } from 'node:child_process'
import { cpSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { createServer, request } from 'node:http'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { buildFixture, deckDir, openDevPage, presmium, serve, startDev } from './fixtures/deck.ts'
import type { DevServer, FixtureDeck } from './fixtures/deck.ts'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const FIXTURE = join(ROOT, 'e2e/fixtures/server')
const SERVE_HOST = join(ROOT, 'packages/server/test/fixtures/serve-host.ts')
/** The packages the fixture plugin's browser code imports, which the demo does not depend on. */
const LINK = { '@presmium/host': 'packages/host' }

// The two host names of a SHARED deployment, the workspace site and the owner console, lead to this machine.
test.use({ launchOptions: { args: ['--host-resolver-rules=MAP site.test 127.0.0.1, MAP console.test 127.0.0.1'] } })

test.describe('presmium dev', () => {
  test.describe.configure({ mode: 'serial', timeout: 180_000 })
  let dir: string
  let dev: DevServer
  test.beforeAll(async () => {
    test.setTimeout(300_000)
    dir = deckDir('server-dev', LINK)
    cpSync(FIXTURE, dir, { recursive: true })
    dev = await startDev(dir, 'web')
  })
  test.afterAll(async () => {
    await dev?.stop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  test('a component shows the server\'s answer, and the toolbar asks for the route\'s approval', async ({ page }) => {
    const component = page.locator('.fixture-server')
    await openDevPage(page, dev.url, component.locator('.fixture-server__value', { hasText: '来自服务端的回答' }))
    const entry = page.locator('.pm-approvals__toggle')
    await expect(entry).toHaveCount(0)

    for (const [choice, outcome] of [['允许', '已允许'], ['拒绝', '已拒绝']] as const) {
      await component.getByRole('button', { name: '请求确认' }).click()
      await expect(component.locator('.fixture-server__result')).toHaveText('等待确认')
      await expect(entry).toHaveText('待确认 1')
      await entry.click()
      const dialog = page.getByRole('dialog', { name: '待确认的操作' })
      await expect(dialog.locator('.pm-approvals__title')).toHaveText('运行测试操作')
      await dialog.getByRole('button', { name: choice }).click()
      await expect(component.locator('.fixture-server__result')).toHaveText(outcome)
      await expect(entry).toHaveCount(0)
    }
  })
})

test.describe('static output', () => {
  test.describe.configure({ mode: 'serial' })
  let deck: FixtureDeck
  test.beforeAll(async () => {
    test.setTimeout(300_000)
    deck = await buildFixture('server', { to: 'web', link: LINK })
  })
  test.afterAll(async () => {
    await deck?.close()
  })

  test('without a server the component degrades and the toolbar has no approvals', async ({ page }) => {
    await page.goto(deck.web)
    await expect(page.locator('.fixture-server__value')).toHaveText('服务端不可用')
    await expect(page.locator('.fixture-server__ask')).toHaveCount(0)
    await expect(page.locator('.pm-approvals')).toHaveCount(0)
  })

  test('the IR runtime reports go as the present view moves, and a replayed go moves it without a report', async ({ page }) => {
    await page.goto(`${deck.web}/?view=present`)
    const present = page.locator('.pm-present')
    await expect(present).toHaveAttribute('data-section', '服务端')
    await expect.poll(() => page.evaluate(() => Array.isArray(window.fixtureOperations))).toBe(true)
    await page.keyboard.press('ArrowRight')
    await expect(present).toHaveAttribute('data-section', '步骤')
    await page.keyboard.press('ArrowRight')
    await expect(present).toHaveAttribute('data-step', '1')
    await page.keyboard.press('ArrowRight')
    await expect(present).toHaveAttribute('data-step', '2')
    const reported = await page.evaluate(() => window.fixtureOperations!.filter(op => op.type === 'go').map(op => op.data))
    expect(reported).toEqual(expect.arrayContaining([
      { section: '步骤', step: 0, view: 'present' },
      { section: '步骤', step: 1, view: 'present' },
      { section: '步骤', step: 2, view: 'present' },
    ]))

    // On to the last section, then the recorded position again.
    await page.keyboard.press('End')
    await expect(present).toHaveAttribute('data-section', '结尾')
    const before = await page.evaluate(() => window.fixtureOperations!.length)
    const replayed = await page.evaluate(() => window.fixtureReplay!({ type: 'go', data: { section: '步骤', step: 1, view: 'present' } }))
    expect(replayed).toBe(true)
    await expect(present).toHaveAttribute('data-section', '步骤')
    await expect(present).toHaveAttribute('data-step', '1')
    await page.waitForTimeout(300)
    expect(await page.evaluate(() => window.fixtureOperations!.length)).toBe(before)
  })

  test('the presenter window shows the mark of a role without children; the document and present views do not', async ({ page }) => {
    await page.goto(deck.web)
    const narration = page.locator('.pm-section[data-section="服务端"] .pm-block--narration')
    await expect(narration).toContainText('可见的角色')
    await expect(page.locator('.pm-role-mark')).toHaveCount(0)

    await page.goto(`${deck.web}/?view=present`)
    await expect(page.locator('.pm-present')).toHaveAttribute('data-section', '服务端')
    await expect(page.locator('.pm-role-mark')).toHaveCount(0)

    const [presenter] = await Promise.all([page.waitForEvent('popup'), page.keyboard.press('p')])
    const notes = presenter.locator('.pm-presenter__notes')
    await expect(notes).toContainText('可见的角色')
    await expect(notes.locator('.pm-role-mark')).toHaveText('〔probe hidden〕')
  })
})

/** A listener that answers every request with JSON (the gateway and agent-host of the SHARED setup). */
async function stub(): Promise<{ url: string, server: Server }> {
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end('{}')
  })
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, server }
}

/**
 * The login proxy of the SHARED setup, as oauth2-proxy forwards: the `Host` kept, the shared
 * secret and the member's identity added (the owner's; a Node request names another with `X-Test-As`).
 */
async function loginProxy(target: string, secret: string): Promise<{ port: number, server: Server }> {
  const upstream = new URL(target)
  const server = createServer((req, res) => {
    const headers = { ...req.headers, 'x-presmium-proxy-secret': secret, 'x-forwarded-email': (req.headers['x-test-as'] as string | undefined) ?? 'owner@test' }
    const forwarded = request({ host: upstream.hostname, port: upstream.port, method: req.method, path: req.url, headers }, (answer) => {
      res.writeHead(answer.statusCode ?? 502, answer.headers)
      answer.pipe(res)
    })
    forwarded.on('error', () => res.destroy())
    req.pipe(forwarded)
  })
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
  return { port: (server.address() as AddressInfo).port, server }
}

test.describe('the owner console (SHARED)', () => {
  test.describe.configure({ mode: 'serial', timeout: 120_000 })
  const SECRET = 'e2e-proxy-secret'
  let dir: string
  const servers: Server[] = []
  const closers: (() => Promise<void>)[] = []
  let port: number

  test.beforeAll(async () => {
    test.setTimeout(300_000)
    // A workspace whose document `doc` is the fixture deck; its site is the deck's static build.
    dir = deckDir('server-shared', LINK)
    mkdirSync(join(dir, 'doc'))
    cpSync(FIXTURE, join(dir, 'doc'), { recursive: true })
    await presmium(['build', '--to', 'web'], join(dir, 'doc'))
    const site = await serve(join(dir, 'doc/dist/web'))
    closers.push(site.close)
    const [gateway, agentHost] = await Promise.all([stub(), stub()])
    servers.push(gateway.server, agentHost.server)
    const host = spawn(process.execPath, [SERVE_HOST], {
      stdio: ['ignore', 'pipe', 'inherit'],
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        SERVE_WORKSPACE: dir,
        SERVE_FORWARD: site.url,
        SERVE_ROLES: JSON.stringify({ 'owner@test': ['owner'], 'editor@test': ['editor'] }),
        PRESMIUM_PROXY_SECRET: SECRET,
        PRESMIUM_GATEWAY_URL: gateway.url,
        PRESMIUM_GATEWAY_TOKEN: 'e2e-gateway-token',
        PRESMIUM_AGENT_HOST_URL: agentHost.url,
        PRESMIUM_AGENT_HOST_TOKEN: 'e2e-agent-host-token',
        PRESMIUM_CONSOLE_HOST: 'console.test',
      },
    })
    closers.push(async () => {
      if (host.exitCode !== null) return
      const exited = new Promise(done => host.once('exit', done))
      host.kill('SIGTERM')
      await exited
    })
    const line = await new Promise<string>((resolve, reject) => {
      let output = ''
      host.stdout!.on('data', (chunk: Buffer) => {
        output += chunk
        const match = /^\{.*\}$/m.exec(output)
        if (match) resolve(match[0])
      })
      host.once('exit', code => reject(new Error(`the serve host exited (${code}): ${output}`)))
    })
    const started = JSON.parse(line) as { url?: string, error?: string }
    if (!started.url) throw new Error(started.error)
    const proxy = await loginProxy(started.url, SECRET)
    servers.push(proxy.server)
    port = proxy.port
  })
  test.afterAll(async () => {
    for (const close of closers.reverse()) await close()
    for (const server of servers) {
      server.closeAllConnections()
      await new Promise(done => server.close(done))
    }
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  /** Whether a promise is still pending after a while. */
  async function pending(promise: Promise<unknown>): Promise<boolean> {
    return Promise.race([promise.then(() => false), new Promise<boolean>(done => setTimeout(() => done(true), 500))])
  }

  test('the deck\'s code in the owner\'s page cannot answer a workspace approval; the owner console can, and shows nothing of the deck', async ({ context }) => {
    const site: Page = await context.newPage()
    await site.goto(`http://site.test:${port}/`)
    await expect(site.locator('.fixture-server__value')).toHaveText('服务端不可用')

    // An editor's route asks for a workspace approval.
    const asked = fetch(`http://127.0.0.1:${port}/__presmium/fixture.server/approve?scope=workspace`, {
      method: 'POST',
      headers: { 'X-Test-As': 'editor@test', 'Presmium-Document': 'doc' },
    }).then(response => response.json() as Promise<{ allowed: boolean }>)

    const console = await context.newPage()
    await console.goto(`http://console.test:${port}/`)
    const item = console.locator('li[data-approval]')
    await expect(item).toHaveCount(1)
    await expect(item.locator('pre')).toHaveText('print("hello")')
    const id = await item.getAttribute('data-approval')

    // The deck's component answers as the owner, on the site and across to the console: neither counts.
    await site.locator('.fixture-server__approval').fill(id!)
    await site.locator('.fixture-server__console').fill(`http://console.test:${port}/__presmium/presmium.server/control`)
    await site.getByRole('button', { name: '代为允许' }).click()
    await expect(site.locator('.fixture-server__answers')).toHaveText(/^same:403 across:(opaque|error)$/)
    expect(await pending(asked)).toBe(true)
    await expect(item).toHaveCount(1)

    // The owner on the console's own page.
    await item.getByRole('button', { name: /^(允许|Allow)$/ }).click()
    expect(await asked).toEqual({ allowed: true })
    await expect(item).toHaveCount(0)
    // The console renders nothing of the deck.
    const text = await console.locator('body').innerText()
    expect(text).not.toContain('服务端不可用')
    expect(await console.locator('.fixture-server').count()).toBe(0)
    expect(readFileSync(join(dir, 'doc/lecture.md'), 'utf8')).toContain('FixtureServer')
  })
})
