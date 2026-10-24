import { execFileSync, spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
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

function clean(extra: Record<string, string>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env }
  delete env.NODE_ENV
  for (const name of Object.keys(env)) {
    if (name.startsWith('PRESMIUM_') || /(?:_KEY|_TOKEN|_SECRET|_PASSWORD|_APPID)$/i.test(name)) delete env[name]
  }
  return { ...env, ...extra }
}

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

const SENTINEL = `outside-${Math.random().toString(36).slice(2)}`

function workspaceCopy(prefix: string, edit: (dir: string) => void = () => {}): string {
  const work = join(ROOT, 'e2e/fixtures/regression/.presmium')
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

async function serveLocal(dir: string, children: ChildProcess[]): Promise<string> {
  const started = await start(dir, ['serve', '--port', '0'], clean({ XDG_STATE_HOME: `${dir}.state`, XDG_CACHE_HOME: `${dir}.cache` }), /^serve {2}(http\S+)$/m)
  children.push(started.child)
  return `${started.match}/`
}

async function cleanUp(children: ChildProcess[], dirs: string[]): Promise<void> {
  for (const child of children) await stop(child)
  for (const dir of dirs) for (const path of [dir, `${dir}.state`, `${dir}.cache`, `${dir}.outside`]) rmSync(path, { recursive: true, force: true })
}

test.describe('a workspace served on this machine', () => {
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

  test('a {literalinclude} shows a file of the workspace as code, and the file a symbolic link names outside it, as presmium dev does', async ({ page }) => {
    const section = page.locator('.pm-section[data-section="code"]')
    await openDevPage(page, `${home}intro/`, section)
    await expect(section.locator('pre').first()).toContainText('print("在工作区之内")')
    await expect(section.locator('pre').nth(1)).toContainText(SENTINEL)
    const ir = await page.evaluate(async () => (await fetch('/__app/ir?document=intro')).text())
    const doc = JSON.parse(ir) as { diagnostics: { checkId: string, severity: string }[] }
    expect(doc.diagnostics.filter(d => d.severity === 'error')).toEqual([])
  })

})

const NETWORK = Object.values(networkInterfaces()).flatMap(entries => entries ?? []).find(entry => entry.family === 'IPv4' && !entry.internal)?.address

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

const CLASS = `---
title: 课堂
plugins:
  - '@lincyaw/addon-session'
---

(class-one)=
# 第一节

第一节的内容。

(class-two)=
## 第二节

第二节的内容。
`

test.describe('presmium serve on the local network (revised), with the classroom sync on its own port', () => {
  test.describe.configure({ mode: 'serial', timeout: 180_000 })
  test.skip(!NETWORK, 'this machine has no network address besides the loopback')
  const dirs: string[] = []
  const children: ChildProcess[] = []
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

  test('another device opens the home page and a document at the machine\'s address; approvals work there; another site\'s request is still refused', async ({ page }) => {
    await openDevPage(page, lan, page.locator('.pm-site-home__document[data-document="intro"]'))
    await openDevPage(page, `${lan}intro/`, page.locator('.pm-section[data-section="导论"]'))

    const asked = page.evaluate(async () => (await fetch('/__presmium/fixture.home/approve', { method: 'POST', headers: { 'Presmium-Document': 'intro' } })).json() as Promise<{ allowed: boolean }>)
    const entry = page.locator('.pm-approvals__toggle')
    await expect(entry).toHaveText('待确认 1')
    await entry.click()
    const dialog = page.getByRole('dialog', { name: '待确认的操作' })
    await expect(dialog.locator('.pm-approvals__title')).toHaveText('局域网中的确认')
    await dialog.getByRole('button', { name: '允许' }).click()
    expect(await asked).toEqual({ allowed: true })

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
      expect(sockets.some(url => url.startsWith(`ws://${NETWORK}:${new URL(lan).port}/__presmium/presmium.session/sync/${room}?`))).toBe(true)
    } finally {
      await Promise.all(contexts.map(context => context.close()))
    }
  })
})
