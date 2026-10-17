// The workspace in the browser (WP-79, P-120, P-121): a shared deployment on this machine (`presmium serve`
// with a login proxy's secret, `presmium gateway`, `presmium agent-host`), with a test login proxy per member
// that adds the secret and the member's identity, as oauth2-proxy would. An editor creates, renames, copies and
// deletes documents on the home page, and the history shows the four commits; without an assistant the new
// document form has no "draft with the agent"; a reader sees no edit entry; in edit mode the mark of a role
// without children shows; a `{literalinclude}` shows a file of the workspace but not one a symbolic link out
// of it names; with an assistant (a stand-in of the `AGENT` service), a drafted document opens once the
// draft is committed; the home page loads the operator plugins' browser parts and serves their routes
// (WP-81e2), which a document's page loads only when its deck lists the plugin; there their routes find
// none of the workspace's files. The history names the operations in the workspace's language. On this
// machine (LOCAL): a rename undone from the history brings the directory back on the home page and its page
// shows, a creation undone takes it away, a document made on disk shows after the next request (F-10); the
// history's labels and dates are zh-CN's, or English's in an English workspace (F-55).
import { execFileSync, spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer, request } from 'node:http'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { openDevPage } from './fixtures/deck.ts'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const FIXTURE = join(ROOT, 'e2e/fixtures/workspace')
const PRESMIUM = join(ROOT, 'packages/cli/bin/presmium.mjs')

// The site's host name and the owner console's lead to this machine.
test.use({ launchOptions: { args: ['--host-resolver-rules=MAP site.test 127.0.0.1, MAP console.test 127.0.0.1'] } })

/** The stand-in of the assistant's `AGENT` client in the page: one drafting task, whose events the test sends. */
interface DraftAgent {
  requests: unknown[]
  emit(event: Record<string, unknown>): void
  client: unknown
}

declare global {
  interface Window {
    draftAgent?: DraftAgent
  }
}

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
  const SENTINEL = `sentinel-${Math.random().toString(36).slice(2)}`
  let dir: string
  let outside: string
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
    // A symbolic link in a document to a file outside the workspace, which a `{literalinclude}` names.
    outside = mkdtempSync(join(work, 'e2e-outside-'))
    writeFileSync(join(outside, 'secret.txt'), `${SENTINEL}\n`)
    symlinkSync(join(outside, 'secret.txt'), join(dir, 'intro/secret.txt'))
    // The operator's plugins, installed at the workspace root (D14).
    for (const name of ['presmium-fixture-workspace-probe', 'presmium-fixture-workspace-home']) cpSync(join(FIXTURE, 'plugins', name), join(dir, 'node_modules', name), { recursive: true })
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
    if (outside) rmSync(outside, { recursive: true, force: true })
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

    // The history names each operation in the workspace's language (the commits' summaries stay English, F-55).
    await page.locator('.pm-workspace-history__toggle').click()
    const history = page.getByRole('dialog', { name: '修改历史' })
    await expect(history.locator('.pm-workspace-revision')).toHaveCount(4)
    await expect(history.locator('.pm-workspace-revision__summary')).toHaveText([
      '删除文档 intro-copy',
      '复制文档 intro 为 intro-copy',
      '重命名文档 week3 为 week4',
      '新建文档 week3',
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

  test('the home page loads the operator plugins\' browser parts and their routes answer for it; a document\'s page loads its deck\'s plugins', async ({ page }) => {
    await openDevPage(page, `http://site.test:${reader}/`, page.locator('.pm-site-home__document[data-document="intro"]'))
    await expect(page.locator('html')).toHaveAttribute('data-fixture-home', 'loaded')
    // The operator plugin's route on the home page (document ''), as on a document's; the home page is no
    // document: the plugin's deck directory there holds none of the workspace's files (its git directory either).
    const where = (document: string) => page.evaluate(async (dir) => {
      const response = await fetch('/__presmium/fixture.home/where', { headers: { 'Presmium-Document': dir } })
      return { status: response.status, body: await response.json() as unknown }
    }, document)
    expect(await where('')).toEqual({ status: 200, body: { document: '', sees: [] } })
    expect(await where('intro')).toEqual({ status: 200, body: { document: 'intro', sees: ['presmium.workspace.yaml', '.git', 'lecture.md'] } })
    // The deck of intro does not list it: its page does not load its browser part.
    await openDevPage(page, `http://site.test:${reader}/intro/`, page.locator('.pm-section[data-section="导论"]'))
    await expect(page.locator('.pm-toolbar--bar')).toBeAttached()
    await expect(page.locator('html')).not.toHaveAttribute('data-fixture-home', 'loaded')
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

  test('a {literalinclude} shows a file of the workspace as code, and nothing of a symbolic link out of it', async ({ page }) => {
    const section = page.locator('.pm-section[data-section="code"]')
    await openDevPage(page, `http://site.test:${editor}/intro/`, section)
    await expect(section.locator('pre').first()).toContainText('print("在工作区之内")')
    await expect(section).not.toContainText('引入的代码')
    await expect(page.locator('body')).not.toContainText(SENTINEL)
    // The compilation refused to read it, and says so; the sentinel is nowhere in the IR.
    const ir = await page.evaluate(async () => (await fetch('/intro/@presmium/ir')).text())
    expect(ir).not.toContain(SENTINEL)
    const { doc } = JSON.parse(ir) as { doc: { diagnostics: { checkId: string, severity: string, message: string }[] } }
    expect(doc.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ checkId: 'presmium.files', severity: 'error', message: expect.stringContaining('intro/secret.txt') })]))
  })

  test('with an assistant, a document the agent drafts opens once the draft is committed, after its review', async ({ page }) => {
    // The assistant's `AGENT` client (WP-80) stands in, as one more plugin of the page's workspace module.
    const decisions: unknown[] = []
    await page.exposeFunction('recordDraftDecision', (decision: unknown) => decisions.push(decision))
    await page.addInitScript(() => {
      const events: Record<string, unknown>[] = []
      let wake: (() => void) | undefined
      const agent: DraftAgent = {
        requests: [],
        emit(event) {
          events.push(event)
          wake?.()
        },
        client: {
          available: () => true,
          provider: () => 'Fixture',
          runtime: () => undefined,
          submit(request: unknown) {
            agent.requests.push(request)
            return {
              id: 'draft-1',
              events: (async function* () {
                for (;;) {
                  const event = events.shift()
                  if (!event) {
                    await new Promise<void>(done => wake = done)
                    continue
                  }
                  yield event
                  if (event.type === 'done' || event.type === 'error') return
                }
              })(),
              cancel() {},
              async review(decision: unknown) {
                await (window as unknown as { recordDraftDecision(decision: unknown): Promise<void> }).recordDraftDecision(decision)
                agent.emit({ type: 'done', revision: 'draft-commit' })
              },
            }
          },
        },
      }
      window.draftAgent = agent
    })
    await page.route('**/packages/workspace/src/client/plugin.ts*', async (route) => {
      // Fetched from the test process, where site.test does not resolve: the login proxy's own address.
      const response = await route.fetch({ url: route.request().url().replace('//site.test:', '//127.0.0.1:') })
      const agentPlugin = `export const fixtureAgent = { manifest: { id: 'fixture.agent', version: '0.1.0', kernel: '^0.1.0', provides: [{ id: 'presmium.agent' }] }, setup(ctx) { ctx.provide({ id: 'presmium.agent' }, window.draftAgent.client) } }`
      await route.fulfill({ response, body: `${await response.text()}\n${agentPlugin}\n` })
    })

    const home = `http://site.test:${editor}/`
    await openDevPage(page, home, page.locator('.pm-site-home__document[data-document="intro"]'))
    await page.locator('.pm-workspace-documents__toggle').click()
    const panel = page.getByRole('dialog', { name: '管理文档' })
    await panel.locator('input[name="dir"]').fill('week5')
    await panel.locator('input[name="title"]').fill('第五周')
    await panel.getByRole('checkbox', { name: '由 agent 起草（模型由 Fixture 提供）' }).check()
    await panel.locator('textarea[name="request"]').fill('写一节关于上下文窗口的讲义')
    await panel.getByRole('button', { name: '新建', exact: true }).click()

    // The document exists from its template; the page stays while the agent drafts, and the review is answered here.
    const draft = panel.locator('.pm-workspace-draft')
    await expect(draft).toHaveAttribute('data-state', 'drafting')
    await expect(page.locator('.pm-site-home__document[data-document="week5"]')).toContainText('第五周')
    expect(await page.evaluate(() => window.draftAgent!.requests)).toEqual([{ kind: 'chat', prompt: '写一节关于上下文窗口的讲义', context: { document: 'week5' } }])
    await page.evaluate(() => window.draftAgent!.emit({ type: 'progress', text: '写第一节' }))
    await expect(draft.locator('.pm-workspace-draft__note')).toHaveText('写第一节')
    await page.evaluate(() => window.draftAgent!.emit({ type: 'review', engine: 'git', changes: [{ path: 'week5/lecture.md', kind: 'modified', binary: false, added: 12, removed: 3 }], steps: [] }))
    await expect(draft).toHaveAttribute('data-state', 'review')
    await expect(draft.locator('.pm-workspace-draft__changes')).toContainText('week5/lecture.md (+12 −3)')
    expect(new URL(page.url()).pathname).toBe('/')

    // Accepted, the task commits and ends: then the page opens the new document.
    await draft.getByRole('button', { name: '接受' }).click()
    await expect(page).toHaveURL(`${home}week5/`)
    expect(decisions).toEqual([{ accept: true }])
  })
})

/** A workspace from the fixture (its operator plugins installed at the root), `edit`ed, as a git repository of its own. */
function workspaceCopy(prefix: string, edit: (dir: string) => void = () => {}): string {
  const work = join(ROOT, 'examples/demo/.presmium')
  mkdirSync(work, { recursive: true })
  const dir = mkdtempSync(join(work, `e2e-workspace-${prefix}-`))
  cpSync(FIXTURE, dir, { recursive: true })
  for (const name of ['presmium-fixture-workspace-probe', 'presmium-fixture-workspace-home']) cpSync(join(FIXTURE, 'plugins', name), join(dir, 'node_modules', name), { recursive: true })
  rmSync(join(dir, 'plugins'), { recursive: true, force: true })
  // The symbolic link the SHARED describe adds is not there: a {literalinclude} of it is an error here.
  writeFileSync(join(dir, 'intro/lecture.md'), readFileSync(join(dir, 'intro/lecture.md'), 'utf8').replace(/```\{literalinclude\} secret\.txt\n```\n?/, ''))
  writeFileSync(join(dir, '.gitignore'), 'node_modules/\ndist/\n.presmium/\n')
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify({ name: dir.split('/').at(-1)!.toLowerCase(), private: true, type: 'module' })}\n`)
  edit(dir)
  const git = (args: string[]) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgSign=false', ...args], { cwd: dir })
  git(['init', '-q', '-b', 'main'])
  git(['add', '-A'])
  git(['commit', '-q', '-m', 'Initial commit'])
  return dir
}

test.describe('the workspace on this machine (LOCAL): the history\'s undo, and documents made on disk, follow on the home page (F-10); the history in the workspace\'s language (F-55)', () => {
  test.describe.configure({ mode: 'serial', timeout: 180_000 })
  const dirs: string[] = []
  /** The home page of each workspace served. */
  const homes: string[] = []
  const children: ChildProcess[] = []

  /** `presmium serve` on this machine of a workspace: its home page. */
  async function serveLocal(dir: string): Promise<string> {
    const started = await start(dir, ['serve', '--port', '0'], clean({ XDG_STATE_HOME: `${dir}.state`, XDG_CACHE_HOME: `${dir}.cache` }), /^serve {2}(http\S+)$/m)
    children.push(started.child)
    homes.push(`${started.match}/`)
    return `${started.match}/`
  }

  test.afterAll(async () => {
    for (const child of children) await stop(child)
    for (const dir of dirs) for (const path of [dir, `${dir}.state`, `${dir}.cache`]) rmSync(path, { recursive: true, force: true })
  })

  /** The history panel, opened on the home page. */
  async function openHistory(page: Page) {
    await page.locator('.pm-workspace-history__toggle').click()
    return page.getByRole('dialog', { name: /^(修改历史|History)$/ })
  }

  test('a rename undone from the history brings the directory back on the home page, its page shows; a creation undone takes it away; labels and dates in zh-CN', async ({ page }) => {
    const dir = workspaceCopy('local')
    dirs.push(dir)
    const home = await serveLocal(dir)
    const listed = page.locator('.pm-site-home__document')
    await openDevPage(page, home, page.locator('.pm-site-home__document[data-document="intro"]'))

    // Renamed, then undone from the history.
    await page.locator('.pm-workspace-documents__toggle').click()
    const documents = page.getByRole('dialog', { name: '管理文档' })
    const intro = documents.locator('.pm-workspace-document[data-document="intro"]')
    await intro.locator('input[name="to"]').fill('intro2')
    await intro.getByRole('button', { name: '重命名' }).click()
    await expect(page.locator('.pm-site-home__document[data-document="intro2"]')).toBeVisible()
    await page.locator('.pm-workspace-documents__toggle').click()
    const history = await openHistory(page)
    const renamed = history.locator('.pm-workspace-revision').first()
    await expect(renamed.locator('.pm-workspace-revision__summary')).toHaveText('重命名文档 intro 为 intro2')
    // The date as zh-CN writes it, e.g. 2026/10/17 12:30:05.
    await expect(renamed.locator('.pm-workspace-revision__meta time')).toHaveText(/^\d{4}\/\d{1,2}\/\d{1,2} \d{1,2}:\d{2}:\d{2}$/)
    await renamed.getByRole('button', { name: '撤销' }).click()
    await expect(history.locator('.pm-workspace-revision').first().locator('.pm-workspace-revision__summary')).toHaveText('撤销「重命名文档 intro 为 intro2」')
    await expect(page.locator('.pm-site-home__document[data-document="intro"]')).toBeVisible()
    await expect(page.locator('.pm-site-home__document[data-document="intro2"]')).toHaveCount(0)
    await openDevPage(page, `${home}intro/`, page.locator('.pm-section[data-section="导论"]'))

    // Created, then undone: the home page lists it no more.
    await openDevPage(page, home, page.locator('.pm-site-home__document[data-document="intro"]'))
    await page.locator('.pm-workspace-documents__toggle').click()
    await documents.locator('input[name="dir"]').fill('week9')
    await documents.locator('input[name="title"]').fill('第九周')
    await documents.getByRole('button', { name: '新建', exact: true }).click()
    await expect(page.locator('.pm-site-home__document[data-document="week9"]')).toBeVisible()
    await page.locator('.pm-workspace-documents__toggle').click()
    const again = await openHistory(page)
    const created = again.locator('.pm-workspace-revision').first()
    await expect(created.locator('.pm-workspace-revision__summary')).toHaveText('新建文档 week9')
    await created.getByRole('button', { name: '撤销' }).click()
    await expect(page.locator('.pm-site-home__document[data-document="week9"]')).toHaveCount(0)
    await page.reload()
    await expect(page.locator('.pm-site-home__document[data-document="intro"]')).toBeVisible()
    await expect(listed).toHaveCount(1)
  })

  test('a document made on disk shows on the home page once the site is asked again, and its page shows', async ({ page }) => {
    const [dir, home] = [dirs[0]!, homes[0]!]
    await openDevPage(page, home, page.locator('.pm-site-home__document[data-document="intro"]'))
    // An author makes it in an editor, or a git pull brings it.
    mkdirSync(join(dir, 'week7'))
    writeFileSync(join(dir, 'week7/lecture.md'), '---\ntitle: 第七周\n---\n\n# 第七周\n\n作者在编辑器中新建的文档。\n')
    await expect(async () => {
      await page.goto(home)
      await expect(page.locator('.pm-site-home__document[data-document="week7"]')).toContainText('第七周', { timeout: 5_000 })
    }).toPass({ timeout: 60_000 })
    await openDevPage(page, `${home}week7/`, page.locator('[data-section]').getByText('作者在编辑器中新建的文档。'))
  })

  test('in a workspace whose documents are English, the history speaks English', async ({ page }) => {
    const dir = workspaceCopy('english', (copy) => {
      writeFileSync(join(copy, 'intro/lecture.md'), readFileSync(join(copy, 'intro/lecture.md'), 'utf8').replace('title: 导论\n', 'title: Introduction\nlang: en\n'))
    })
    dirs.push(dir)
    const home = await serveLocal(dir)
    await openDevPage(page, home, page.locator('.pm-site-home__document[data-document="intro"]'))
    await page.locator('.pm-workspace-documents__toggle').click()
    const documents = page.getByRole('dialog', { name: 'Documents' })
    const intro = documents.locator('.pm-workspace-document[data-document="intro"]')
    await intro.locator('input[name="to"]').fill('intro-copy')
    await intro.getByRole('button', { name: 'Copy' }).click()
    await expect(page.locator('.pm-site-home__document[data-document="intro-copy"]')).toBeVisible()
    await page.locator('.pm-workspace-documents__toggle').click()
    const history = await openHistory(page)
    const copied = history.locator('.pm-workspace-revision').first()
    await expect(copied.locator('.pm-workspace-revision__summary')).toHaveText('Copy document intro to intro-copy')
    await expect(copied.locator('.pm-workspace-revision__meta')).toContainText('document operation')
    // The date as en writes it, e.g. 10/17/2026, 12:30:05 PM.
    await expect(copied.locator('.pm-workspace-revision__meta time')).toHaveText(/^\d{1,2}\/\d{1,2}\/\d{4}, \d{1,2}:\d{2}:\d{2}\s[AP]M$/)
    await copied.getByRole('button', { name: 'Revert' }).click()
    await expect(history.locator('.pm-workspace-revision').first().locator('.pm-workspace-revision__summary')).toHaveText('Revert "Copy document intro to intro-copy"')
  })
})
