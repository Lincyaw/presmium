// The workspace in the browser (WP-79, P-120, P-121): `presmium serve` on this machine, the one member the local
// author. The author creates, renames, copies and deletes documents on the home page, and the history shows the
// four commits; without an assistant the new document form has no "draft with the agent"; the home page loads the
// operator plugins' browser parts and serves their routes (WP-81e2), which a document's page loads only when its
// deck lists the plugin; there their routes find none of the workspace's files; in edit mode the mark of a role
// without children shows; a `{literalinclude}` shows a file of the workspace, and the file a symbolic link names
// outside it, as `presmium dev` and `presmium build` do; with an assistant (a stand-in of the `AGENT` service), a
// drafted document opens once the draft is committed (E-7). The history names the operations in the workspace's
// language. A rename undone from the history brings the directory back on the home page and its page shows, a
// creation undone takes it away, a document made on disk shows after the next request (F-10); the history's
// labels and dates are zh-CN's, or English's in an English workspace (F-55). With `--host 0.0.0.0`, another
// device of the local network uses the workspace at the machine's address, edit mode and approvals included,
// while another site's requests are refused; a deck that names no classroom server has its classroom synced
// on serve's own port, where a learner on that device joins and follows (E-3 revised, one port).
import { execFileSync, spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { request } from 'node:http'
import { networkInterfaces } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { openDevPage } from './fixtures/deck.ts'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const FIXTURE = join(ROOT, 'e2e/fixtures/workspace')
const PRESMIUM = join(ROOT, 'packages/cli/bin/presmium.mjs')


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

/** What the file outside each workspace copy holds, which a symbolic link in its document `intro` names. */
const SENTINEL = `outside-${Math.random().toString(36).slice(2)}`

/**
 * A workspace from the fixture (its operator plugins installed at the root), `edit`ed, as a git repository of its
 * own; `intro/secret.txt` is a symbolic link to a file outside it (`<dir>.outside/secret.txt`).
 */
function workspaceCopy(prefix: string, edit: (dir: string) => void = () => {}): string {
  const work = join(ROOT, 'examples/demo/.presmium')
  mkdirSync(work, { recursive: true })
  const dir = mkdtempSync(join(work, `e2e-workspace-${prefix}-`))
  cpSync(FIXTURE, dir, { recursive: true })
  for (const name of ['presmium-fixture-workspace-probe', 'presmium-fixture-workspace-home']) cpSync(join(FIXTURE, 'plugins', name), join(dir, 'node_modules', name), { recursive: true })
  rmSync(join(dir, 'plugins'), { recursive: true, force: true })
  mkdirSync(`${dir}.outside`)
  writeFileSync(`${dir}.outside/secret.txt`, `${SENTINEL}\n`)
  symlinkSync(`${dir}.outside/secret.txt`, join(dir, 'intro/secret.txt'))
  writeFileSync(join(dir, '.gitignore'), 'node_modules/\ndist/\n.presmium/\n')
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify({ name: dir.split('/').at(-1)!.toLowerCase(), private: true, type: 'module' })}\n`)
  edit(dir)
  const git = (args: string[]) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgSign=false', ...args], { cwd: dir })
  git(['init', '-q', '-b', 'main'])
  git(['add', '-A'])
  git(['commit', '-q', '-m', 'Initial commit'])
  return dir
}

/** `presmium serve` of a workspace on this machine, with state and cache directories of its own: its home page. */
async function serveLocal(dir: string, children: ChildProcess[]): Promise<string> {
  const started = await start(dir, ['serve', '--port', '0'], clean({ XDG_STATE_HOME: `${dir}.state`, XDG_CACHE_HOME: `${dir}.cache` }), /^serve {2}(http\S+)$/m)
  children.push(started.child)
  return `${started.match}/`
}

/** Stops the servers and removes the workspaces with their state, cache and outside directories. */
async function cleanUp(children: ChildProcess[], dirs: string[]): Promise<void> {
  for (const child of children) await stop(child)
  for (const dir of dirs) for (const path of [dir, `${dir}.state`, `${dir}.cache`, `${dir}.outside`]) rmSync(path, { recursive: true, force: true })
}

test.describe('the workspace in the browser', () => {
  test.describe.configure({ mode: 'serial', timeout: 180_000 })
  const dirs: string[] = []
  const children: ChildProcess[] = []
  let home: string

  test.beforeAll(async () => {
    test.setTimeout(300_000)
    const dir = workspaceCopy('browser')
    dirs.push(dir)
    home = await serveLocal(dir, children)
  })

  test.afterAll(async () => {
    await cleanUp(children, dirs)
  })

  test('the author creates, renames, copies and deletes documents; the history shows the four commits; no agent draft without an assistant', async ({ page }) => {
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

  test('the home page loads the operator plugins\' browser parts and their routes answer for it; a document\'s page loads its deck\'s plugins', async ({ page }) => {
    await openDevPage(page, home, page.locator('.pm-site-home__document[data-document="intro"]'))
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
    await openDevPage(page, `${home}intro/`, page.locator('.pm-section[data-section="导论"]'))
    await expect(page.locator('.pm-toolbar--bar')).toBeAttached()
    await expect(page.locator('html')).not.toHaveAttribute('data-fixture-home', 'loaded')
  })

  test('in edit mode the mark of a role without children shows; out of it, it does not', async ({ page }) => {
    await openDevPage(page, `${home}intro/`, page.locator('.pm-workspace-edit'))
    const narration = page.locator('.pm-section[data-section="导论"] .pm-block--narration')
    await expect(narration).toContainText('可见的角色')
    await expect(page.locator('.pm-role-mark')).toHaveCount(0)
    await page.locator('.pm-workspace-edit').click()
    await expect(page.locator('.pm-workspace-edit')).toHaveAttribute('aria-pressed', 'true')
    await expect(narration.locator('.pm-role-mark')).toHaveText('〔probe hidden〕')
    await page.locator('.pm-workspace-edit').click()
    await expect(page.locator('.pm-role-mark')).toHaveCount(0)
  })

  test('a {literalinclude} shows a file of the workspace as code, and the file a symbolic link names outside it, as presmium dev does', async ({ page }) => {
    const section = page.locator('.pm-section[data-section="code"]')
    await openDevPage(page, `${home}intro/`, section)
    await expect(section.locator('pre').first()).toContainText('print("在工作区之内")')
    await expect(section.locator('pre').nth(1)).toContainText(SENTINEL)
    const ir = await page.evaluate(async () => (await fetch('/intro/@presmium/ir')).text())
    const { doc } = JSON.parse(ir) as { doc: { diagnostics: { checkId: string, severity: string }[] } }
    expect(doc.diagnostics.filter(d => d.severity === 'error')).toEqual([])
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
      const response = await route.fetch()
      const agentPlugin = `export const fixtureAgent = { manifest: { id: 'fixture.agent', version: '0.1.0', kernel: '^1.0.0', provides: [{ id: 'presmium.agent' }] }, setup(ctx) { ctx.provide({ id: 'presmium.agent' }, window.draftAgent.client) } }`
      await route.fulfill({ response, body: `${await response.text()}\n${agentPlugin}\n` })
    })

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

/** An IPv4 address of this machine on a network (not the loopback), where another device reaches it. */
const NETWORK = Object.values(networkInterfaces()).flatMap(entries => entries ?? []).find(entry => entry.family === 'IPv4' && !entry.internal)?.address

/** A request of another site's page to `url`: its `Origin` names that site. */
function crossSite(url: string, path: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const { hostname, port } = new URL(url)
    const sent = request({ host: hostname, port, path, method: 'POST', headers: { 'Origin': 'http://attacker.example', 'Presmium-Document': 'intro', 'Content-Type': 'application/json' } }, (res) => {
      res.resume()
      resolve(res.statusCode!)
    })
    sent.on('error', reject)
    sent.end('{}')
  })
}

/** A document whose deck lists the session plugin and names no classroom server. */
const CLASS = `---
title: 课堂
plugins:
  - '@presmium/slidev-addon-session'
---

(class-one)=
# 第一节

第一节的内容。

(class-two)=
## 第二节

第二节的内容。
`

test.describe('presmium serve on the local network (E-3, revised), with the classroom sync on its own port', () => {
  test.describe.configure({ mode: 'serial', timeout: 180_000 })
  test.skip(!NETWORK, 'this machine has no network address besides the loopback')
  const dirs: string[] = []
  const children: ChildProcess[] = []
  /** The home page at the loopback, and at the machine's network address. */
  let local: string
  let lan: string

  test.beforeAll(async () => {
    test.setTimeout(300_000)
    const dir = workspaceCopy('network', (copy) => {
      mkdirSync(join(copy, 'class'))
      writeFileSync(join(copy, 'class/lecture.md'), CLASS)
    })
    dirs.push(dir)
    const started = await start(dir, ['serve', '--host', '0.0.0.0', '--port', '0'], clean({ XDG_STATE_HOME: `${dir}.state`, XDG_CACHE_HOME: `${dir}.cache` }), /^serve {2}(http\S+)$/m)
    children.push(started.child)
    local = `${started.match}/`
    lan = `http://${NETWORK}:${new URL(started.match).port}/`
  })

  test.afterAll(async () => {
    await cleanUp(children, dirs)
  })

  test('another device opens the home page and a document at the machine\'s address; edit mode and approvals work there; another site\'s request is still refused', async ({ page }) => {
    await openDevPage(page, lan, page.locator('.pm-site-home__document[data-document="intro"]'))
    await openDevPage(page, `${lan}intro/`, page.locator('.pm-section[data-section="导论"]'))
    await page.locator('.pm-workspace-edit').click()
    await expect(page.locator('.pm-workspace-edit')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('.pm-section[data-section="导论"] .pm-role-mark')).toHaveText('〔probe hidden〕')

    // A route that asks for approval, answered in this window's toolbar.
    const asked = page.evaluate(async () => (await fetch('/__presmium/fixture.home/approve', { method: 'POST', headers: { 'Presmium-Document': 'intro' } })).json() as Promise<{ allowed: boolean }>)
    const entry = page.locator('.pm-approvals__toggle')
    await expect(entry).toHaveText('待确认 1')
    await entry.click()
    const dialog = page.getByRole('dialog', { name: '待确认的操作' })
    await expect(dialog.locator('.pm-approvals__title')).toHaveText('局域网中的确认')
    await dialog.getByRole('button', { name: '允许' }).click()
    expect(await asked).toEqual({ allowed: true })

    // A page of another site, at either address, is refused.
    for (const at of [lan, local]) expect(await crossSite(at, '/__presmium/fixture.home/approve')).toBe(403)
    await expect(entry).toHaveCount(0)
  })

  test('a presenter opens a classroom and a learner on another device joins and follows, through serve\'s own port, with no classroom server of its own', async ({ browser }) => {
    const contexts = await Promise.all([browser.newContext(), browser.newContext()])
    const [presenter, learner] = await Promise.all(contexts.map(context => context.newPage())) as [Page, Page]
    const sockets: string[] = []
    learner.on('websocket', socket => sockets.push(socket.url()))
    try {
      await openDevPage(presenter, `${local}class/`, presenter.locator('.pm-section[data-section="class-one"]'))
      await presenter.getByRole('button', { name: /^课堂/ }).click()
      const panel = presenter.getByRole('dialog', { name: '课堂' })
      await panel.getByLabel('昵称').fill('王老师')
      await panel.getByRole('button', { name: '创建课堂' }).click()
      await expect(panel.getByRole('status')).toHaveText('课堂进行中，你是主讲')
      const room = new URL((await panel.locator('.pm-session__link').getAttribute('href'))!).searchParams.get('room')!

      await openDevPage(learner, `${lan}class/?room=${room}&name=${encodeURIComponent('小明')}`, learner.locator('.pm-section[data-section="class-one"]'))
      const badge = learner.getByRole('region', { name: '课堂状态' })
      await expect(badge).toContainText('正在跟随主讲')
      await panel.getByRole('button', { name: '关闭' }).click()
      await presenter.getByRole('combobox', { name: '视图' }).selectOption('present')
      const present = (page: Page) => page.getByRole('region', { name: '放映' })
      await expect(present(learner)).toHaveAttribute('data-section', 'class-one')
      await presenter.keyboard.press('ArrowRight')
      await expect(present(presenter)).toHaveAttribute('data-section', 'class-two')
      await expect(present(learner)).toHaveAttribute('data-section', 'class-two')
      // The learner's classroom goes through serve, at the address the learner opened.
      expect(sockets.some(url => url.startsWith(`ws://${NETWORK}:${new URL(lan).port}/__presmium/presmium.session/sync/${room}?`))).toBe(true)
    } finally {
      await Promise.all(contexts.map(context => context.close()))
    }
  })
})

test.describe('the history\'s undo, and documents made on disk, follow on the home page (F-10); the history in the workspace\'s language (F-55)', () => {
  test.describe.configure({ mode: 'serial', timeout: 180_000 })
  const dirs: string[] = []
  /** The home page of each workspace served. */
  const homes: string[] = []
  const children: ChildProcess[] = []

  /** `presmium serve` of a workspace: its home page, kept for the case after. */
  async function serve(dir: string): Promise<string> {
    const home = await serveLocal(dir, children)
    homes.push(home)
    return home
  }

  test.afterAll(async () => {
    await cleanUp(children, dirs)
  })

  /** The history panel, opened on the home page. */
  async function openHistory(page: Page) {
    await page.locator('.pm-workspace-history__toggle').click()
    return page.getByRole('dialog', { name: /^(修改历史|History)$/ })
  }

  test('a rename undone from the history brings the directory back on the home page, its page shows; a creation undone takes it away; labels and dates in zh-CN', async ({ page }) => {
    const dir = workspaceCopy('local')
    dirs.push(dir)
    const home = await serve(dir)
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
    const home = await serve(dir)
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
