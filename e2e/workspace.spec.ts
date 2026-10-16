// The workspace in the browser (WP-79, P-120, P-121): a shared deployment on this machine (`presmium serve`
// with a login proxy's secret, `presmium gateway`, `presmium agent-host`), with a test login proxy per member
// that adds the secret and the member's identity, as oauth2-proxy would. An editor creates, renames, copies and
// deletes documents on the home page, and the history shows the four commits; without an assistant the new
// document form has no "draft with the agent"; a reader sees no edit entry; in edit mode the mark of a role
// without children shows.
import { execFileSync, spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, request } from 'node:http'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { openDevPage } from './fixtures/deck.ts'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const FIXTURE = join(ROOT, 'e2e/fixtures/workspace')
const PRESMIUM = join(ROOT, 'packages/cli/bin/presmium.mjs')

// The site's host name and the owner console's lead to this machine.
test.use({ launchOptions: { args: ['--host-resolver-rules=MAP site.test 127.0.0.1, MAP console.test 127.0.0.1'] } })

/** The environment of the test without credentials or Presmium's variables. */
function clean(extra: Record<string, string>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env }
  delete env.NODE_ENV
  for (const name of Object.keys(env)) {
    if (name.startsWith('PRESMIUM_') || /(?:_KEY|_TOKEN|_SECRET|_PASSWORD|_APPID)$/i.test(name)) delete env[name]
  }
  return { ...env, ...extra }
}

/** `presmium <args>` in `cwd`, resolving with its first line matching `pattern`'s group once it prints it. */
function start(cwd: string, args: string[], env: NodeJS.ProcessEnv, pattern: RegExp): Promise<{ child: ChildProcess, match: string }> {
  const child = spawn(process.execPath, [PRESMIUM, ...args], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  return new Promise((resolve, reject) => {
    const check = () => {
      const found = pattern.exec(output)
      if (found) resolve({ child, match: found[1]! })
    }
    child.stdout!.on('data', (chunk: Buffer) => {
      output += chunk
      check()
    })
    child.stderr!.on('data', (chunk: Buffer) => output += chunk)
    child.once('exit', code => reject(new Error(`presmium ${args[0]} exited (${code}):\n${output}`)))
  })
}

async function stop(child: ChildProcess | undefined): Promise<void> {
  if (!child || child.exitCode !== null || child.signalCode !== null) return
  const exited = new Promise(done => child.once('exit', done))
  child.kill('SIGTERM')
  const timer = setTimeout(() => child.kill('SIGKILL'), 20_000)
  await exited
  clearTimeout(timer)
}

/** A login proxy for one member: the `Host` kept, the shared secret and the member's email added (WebSockets too). */
async function loginProxy(target: string, secret: string, email: string): Promise<{ port: number, server: Server }> {
  const upstream = new URL(target)
  const headersOf = (headers: Record<string, unknown>) => ({ ...headers, 'x-presmium-proxy-secret': secret, 'x-forwarded-email': email })
  const server = createServer((req, res) => {
    const forwarded = request({ host: upstream.hostname, port: upstream.port, method: req.method, path: req.url, headers: headersOf(req.headers) }, (answer) => {
      res.writeHead(answer.statusCode ?? 502, answer.headers)
      answer.pipe(res)
    })
    forwarded.on('error', () => res.destroy())
    req.pipe(forwarded)
  })
  server.on('upgrade', (req, socket, head) => {
    const forwarded = request({ host: upstream.hostname, port: upstream.port, method: req.method, path: req.url, headers: headersOf(req.headers) })
    forwarded.on('upgrade', (answer, upstreamSocket, upstreamHead) => {
      socket.write(`HTTP/1.1 101 Switching Protocols\r\n${Object.entries(answer.headers).map(([k, v]) => `${k}: ${v}`).join('\r\n')}\r\n\r\n`)
      if (upstreamHead.length) socket.write(upstreamHead)
      if (head.length) upstreamSocket.write(head)
      upstreamSocket.pipe(socket).pipe(upstreamSocket)
    })
    forwarded.on('error', () => socket.destroy())
    forwarded.end()
  })
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
  return { port: (server.address() as AddressInfo).port, server }
}

test.describe('the workspace in the browser (SHARED)', () => {
  test.describe.configure({ mode: 'serial', timeout: 180_000 })
  let dir: string
  const children: ChildProcess[] = []
  const servers: Server[] = []
  let editor: number
  let reader: number

  test.beforeAll(async () => {
    test.setTimeout(300_000)
    const work = join(ROOT, 'examples/demo/.presmium')
    mkdirSync(work, { recursive: true })
    dir = mkdtempSync(join(work, 'e2e-workspace-'))
    cpSync(FIXTURE, dir, { recursive: true })
    // The operator's plugin, installed at the workspace root (D14).
    cpSync(join(FIXTURE, 'plugins/presmium-fixture-workspace-probe'), join(dir, 'node_modules/presmium-fixture-workspace-probe'), { recursive: true })
    rmSync(join(dir, 'plugins'), { recursive: true, force: true })
    writeFileSync(join(dir, '.gitignore'), 'node_modules/\ndist/\n.presmium/\n')
    writeFileSync(join(dir, 'package.json'), `${JSON.stringify({ name: dir.split('/').at(-1)!.toLowerCase(), private: true, type: 'module' })}\n`)
    const git = (args: string[]) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgSign=false', ...args], { cwd: dir })
    git(['init', '-q', '-b', 'main'])
    git(['add', '-A'])
    git(['commit', '-q', '-m', 'Initial commit'])

    const id = Math.random().toString(36).slice(2, 10)
    const secret = `proxy-${id}`
    const agentHost = await start(dir, ['agent-host', '--port', '0'], clean({ PRESMIUM_AGENT_HOST_TOKEN: `agent-host-${id}` }), /^agent-host {2}(http\S+)$/m)
    children.push(agentHost.child)
    const gateway = await start(dir, ['gateway', '--port', '0'], clean({ PRESMIUM_GATEWAY_TOKEN: `gateway-${id}` }), /^gateway {2}(http\S+)$/m)
    children.push(gateway.child)
    const serve = await start(dir, ['serve', '--port', '0'], clean({
      PRESMIUM_PROXY_SECRET: secret,
      PRESMIUM_GATEWAY_URL: gateway.match,
      PRESMIUM_GATEWAY_TOKEN: `gateway-${id}`,
      PRESMIUM_AGENT_HOST_URL: agentHost.match,
      PRESMIUM_AGENT_HOST_TOKEN: `agent-host-${id}`,
      PRESMIUM_CONSOLE_HOST: 'console.test',
    }), /^serve {2}(http\S+)$/m)
    children.unshift(serve.child)
    const proxies = await Promise.all([loginProxy(serve.match, secret, 'editor@test'), loginProxy(serve.match, secret, 'reader@test')])
    servers.push(...proxies.map(proxy => proxy.server))
    editor = proxies[0].port
    reader = proxies[1].port
  })

  test.afterAll(async () => {
    for (const child of children) await stop(child)
    for (const server of servers) {
      server.closeAllConnections()
      await new Promise(done => server.close(done))
    }
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  test('an editor creates, renames, copies and deletes documents; the history shows the four commits; no agent draft without an assistant', async ({ page }) => {
    const home = `http://site.test:${editor}/`
    await openDevPage(page, home, page.locator('.pm-site-home__document[data-document="intro"]'))
    await page.locator('.pm-workspace-documents__toggle').click()
    const panel = page.getByRole('dialog', { name: '管理文档' })
    await expect(panel.locator('.pm-workspace-document[data-document="intro"]')).toBeVisible()
    // Without an assistant there is no "draft with the agent".
    await expect(panel.locator('.pm-workspace-create__draft')).toHaveCount(0)

    await panel.locator('input[name="dir"]').fill('week3')
    await panel.locator('input[name="title"]').fill('第三周')
    await panel.getByRole('button', { name: '新建', exact: true }).click()
    await expect(panel.locator('.pm-workspace-document[data-document="week3"]')).toBeVisible()
    await expect(page.locator('.pm-site-home__document[data-document="week3"]')).toContainText('第三周')

    const week3 = panel.locator('.pm-workspace-document[data-document="week3"]')
    await week3.locator('input[name="to"]').fill('week4')
    await week3.getByRole('button', { name: '重命名' }).click()
    await expect(panel.locator('.pm-workspace-document[data-document="week4"]')).toBeVisible()
    await expect(week3).toHaveCount(0)

    const intro = panel.locator('.pm-workspace-document[data-document="intro"]')
    await intro.locator('input[name="to"]').fill('intro-copy')
    await intro.getByRole('button', { name: '复制' }).click()
    const copy = panel.locator('.pm-workspace-document[data-document="intro-copy"]')
    await expect(copy).toBeVisible()

    page.once('dialog', dialog => void dialog.accept())
    await copy.getByRole('button', { name: '删除' }).click()
    await expect(copy).toHaveCount(0)
    await expect(page.locator('.pm-site-home__document')).toHaveCount(2)

    await page.locator('.pm-workspace-history__toggle').click()
    const history = page.getByRole('dialog', { name: '修改历史' })
    await expect(history.locator('.pm-workspace-revision')).toHaveCount(4)
    await expect(history.locator('.pm-workspace-revision__summary')).toHaveText([
      'Delete document intro-copy',
      'Copy document intro to intro-copy',
      'Rename document week3 to week4',
      'Create document week3',
    ])
  })

  test('a reader sees no edit entry, on the home page nor on a document', async ({ page }) => {
    await openDevPage(page, `http://site.test:${reader}/`, page.locator('.pm-site-home__document[data-document="intro"]'))
    await expect(page.locator('.pm-toolbar--bar')).toBeAttached()
    await expect(page.locator('.pm-workspace-documents__toggle')).toHaveCount(0)
    await expect(page.locator('.pm-workspace-history__toggle')).toHaveCount(0)
    await openDevPage(page, `http://site.test:${reader}/intro/`, page.locator('.pm-section[data-section="导论"]'))
    await expect(page.locator('.pm-toolbar--bar')).toBeAttached()
    await expect(page.locator('.pm-workspace-edit')).toHaveCount(0)
    // An editor's page of the same document has the entry.
    await openDevPage(page, `http://site.test:${editor}/intro/`, page.locator('.pm-workspace-edit'))
  })

  test('in edit mode the mark of a role without children shows; out of it, it does not', async ({ page }) => {
    await openDevPage(page, `http://site.test:${editor}/intro/`, page.locator('.pm-workspace-edit'))
    const narration = page.locator('.pm-section[data-section="导论"] .pm-block--narration')
    await expect(narration).toContainText('可见的角色')
    await expect(page.locator('.pm-role-mark')).toHaveCount(0)
    await page.locator('.pm-workspace-edit').click()
    await expect(page.locator('.pm-workspace-edit')).toHaveAttribute('aria-pressed', 'true')
    await expect(narration.locator('.pm-role-mark')).toHaveText('〔probe hidden〕')
    await page.locator('.pm-workspace-edit').click()
    await expect(page.locator('.pm-role-mark')).toHaveCount(0)
  })
})
