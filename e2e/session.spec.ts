import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { cpSync, createReadStream, existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { extname, join, resolve, sep } from 'node:path'
import { expect, test } from '@playwright/test'
import type { Browser, Page } from '@playwright/test'
import { SLIDES, WEB } from './urls.ts'

// Classroom sessions (pages/session.md). The demo configures no classroom server; the classroom
// tests build a copy of the session pages whose frontmatter points to a real classroom server
// (`presmium-classroom-server` on a free port) and drive a presenter and a learner in separate
// browser contexts.

const panelButton = (page: Page) => page.getByRole('button', { name: /^课堂/ })
const present = (page: Page) => page.getByRole('region', { name: '放映' })
const badge = (page: Page) => page.getByRole('region', { name: '课堂状态' })

test('without a classroom server the deck shows and reads as before, and the session says it is not connected', async ({ page }) => {
  await page.goto(`${WEB}/session.html`)
  await expect(page.locator('.pm-section[data-section="session-follow"]')).toContainText('回到主讲进度')
  await expect(panelButton(page)).toContainText('未连接')
  await panelButton(page).click()
  await expect(page.getByRole('dialog', { name: '课堂' }).getByRole('status')).toHaveText(/^未连接/)
  await expect(badge(page)).toHaveCount(0)

  await page.goto(`${WEB}/session.html?view=present&section=session-follow`)
  await expect(present(page)).toHaveAttribute('data-section', 'session-follow')
  await page.keyboard.press('ArrowRight')
  await expect(present(page)).toHaveAttribute('data-step', '1')

  // The slides: the presenter view's panel says the same; the slides still step.
  await page.goto(`${SLIDES}/presenter/session`)
  await page.locator('.pm-presenter-panels summary').click()
  await expect(page.locator('[data-panel="presmium.session"]').getByRole('status')).toHaveText(/^未连接/)
  await page.goto(`${SLIDES}/session`)
  await expect(page.locator('.slidev-page').getByRole('heading', { name: '课堂会话' })).toBeVisible()
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('.slidev-page').getByRole('heading', { name: '跟随与自主' })).toBeVisible()
})

// ---------------------------------------------------------------------------
// A deck with a classroom server
// ---------------------------------------------------------------------------

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.webmanifest': 'application/manifest+json',
}

/** Serves a build directory on a free port; `single` answers unknown paths with index.html (the slides' routes). */
async function serve(dir: string, single: boolean): Promise<{ url: string, close(): Promise<void> }> {
  const server = createServer((request, response) => {
    let file = join(dir, decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname))
    if (!file.startsWith(dir + sep) && file !== dir) file = dir
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html')
    const found = existsSync(file)
    if (!found) file = join(dir, single ? 'index.html' : '404.html')
    response.writeHead(found || single ? 200 : 404, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' })
    createReadStream(file).pipe(response)
  })
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    close: () => new Promise(done => server.close(() => done())),
  }
}

/** `presmium-classroom-server --port 0`, until it prints its URL. */
async function startClassroomServer(): Promise<{ url: string, child: ChildProcess }> {
  const child = spawn(process.execPath, [resolve('packages/classroom-server/bin/server.mjs'), '--port', '0', '--host', '127.0.0.1'], { stdio: ['ignore', 'pipe', 'inherit'] })
  const url = await new Promise<string>((done, fail) => {
    let output = ''
    child.stdout!.on('data', (chunk: Buffer) => {
      output += chunk
      const match = /^classroom server {2}(ws:\S+)$/m.exec(output)
      if (match) done(match[1]!)
    })
    child.once('exit', code => fail(new Error(`classroom server exited (${code}): ${output}`)))
  })
  return { url, child }
}

/** The session pages and the web pages of the demo, as a deck of their own whose frontmatter names the classroom server. */
function writeDeck(server: string): string {
  const work = resolve('examples/demo/.presmium')
  mkdirSync(work, { recursive: true })
  const deck = mkdtempSync(join(work, 'e2e-session-'))
  writeFileSync(join(deck, '.gitignore'), '*\n')
  for (const page of ['session.md', 'web.md']) cpSync(resolve('examples/demo/pages', page), join(deck, 'pages', page))
  writeFileSync(join(deck, 'lecture.md'), `---
title: Presmium Classroom
plugins:
  - '@presmium/slidev-addon-core'
  - '@presmium/slidev-addon-stage'
  - '@presmium/slidev-addon-session'
presmium:
  presmium.core:
    demo: true
  presmium.session:
    server: ${server}
renderers:
  web: {}
  slides:
    theme: default
---

# Presmium Classroom

课堂演示文稿。

\`\`\`{include} pages/session.md
\`\`\`

\`\`\`{include} pages/web.md
\`\`\`
`)
  return deck
}

async function build(deck: string): Promise<void> {
  const child = spawn(process.execPath, [resolve('packages/cli/bin/presmium.mjs'), 'build', '--to', 'web,slides'], { cwd: deck, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  child.stdout!.on('data', (chunk: Buffer) => output += chunk)
  child.stderr!.on('data', (chunk: Buffer) => output += chunk)
  const code = await new Promise<number | null>(done => child.once('exit', done))
  if (code !== 0) throw new Error(`presmium build exited (${code}):\n${output}`)
}

/** A presenter and a learner, each in a browser context of their own. */
async function people(browser: Browser): Promise<{ presenter: Page, learner: Page, close(): Promise<void> }> {
  const contexts = await Promise.all([browser.newContext(), browser.newContext()])
  const [presenter, learner] = await Promise.all(contexts.map(context => context.newPage()))
  return {
    presenter: presenter!,
    learner: learner!,
    close: async () => {
      await Promise.all(contexts.map(context => context.close()))
    },
  }
}

test.describe('a classroom', () => {
  test.describe.configure({ mode: 'serial', timeout: 90_000 })
  let classroom: Awaited<ReturnType<typeof startClassroomServer>>
  let deck: string
  let web: Awaited<ReturnType<typeof serve>>
  let slides: Awaited<ReturnType<typeof serve>>

  test.beforeAll(async () => {
    test.setTimeout(240_000)
    classroom = await startClassroomServer()
    deck = writeDeck(classroom.url)
    await build(deck)
    web = await serve(join(deck, 'dist/web'), false)
    slides = await serve(join(deck, 'dist/slides'), true)
  })

  test.afterAll(async () => {
    await web?.close()
    await slides?.close()
    classroom?.child.kill('SIGTERM')
    if (deck) rmSync(deck, { recursive: true, force: true })
  })

  test('in the web form a learner follows the presenter, browses alone, comes back in one click, and sees the classroom end', async ({ browser }) => {
    const { presenter, learner, close } = await people(browser)

    await presenter.goto(`${web.url}/session.html`)
    await panelButton(presenter).click()
    const panel = presenter.getByRole('dialog', { name: '课堂' })
    await panel.getByLabel('昵称').fill('王老师')
    await panel.getByRole('button', { name: '创建课堂' }).click()
    await expect(panel.getByRole('status')).toHaveText('课堂进行中，你是主讲')
    await expect(panel.getByRole('img', { name: '加入课堂的二维码' }).locator('svg')).toBeVisible()
    const link = await panel.locator('.pm-session__link').getAttribute('href')
    expect(link).toMatch(/\/\?room=\w+$/)

    // The join link opens the site's first page; the learner goes to the presenter's section, on its page.
    await learner.goto(`${link}&name=${encodeURIComponent('小明')}`)
    await expect(badge(learner)).toContainText('正在跟随主讲')
    await expect(learner).toHaveURL(/\/session\.html/)
    await expect(panel.getByRole('list', { name: '参与者' })).toContainText('小明')

    // The presenter presents: the learner follows into the present view, to the section and step.
    await panel.getByRole('button', { name: '关闭' }).click()
    await presenter.getByRole('combobox', { name: '视图' }).selectOption('present')
    await expect(present(presenter)).toHaveAttribute('data-section', 'session')
    for (let i = 0; i < 3; i++) await presenter.keyboard.press('ArrowRight')
    await expect(present(presenter)).toHaveAttribute('data-section', 'session-follow')
    await expect(present(presenter)).toHaveAttribute('data-step', '2')
    await expect(present(learner)).toHaveAttribute('data-section', 'session-follow')
    await expect(present(learner)).toHaveAttribute('data-step', '2')

    // Browsing alone, the learner stays where they are while the presenter moves on.
    await badge(learner).getByRole('button', { name: '自主浏览' }).click()
    await presenter.keyboard.press('ArrowRight')
    await expect(badge(learner)).toContainText('主讲在第 3 节第 3 步')
    await expect(present(learner)).toHaveAttribute('data-step', '2')

    // One click goes back to the presenter's place, and following goes on.
    await badge(learner).getByRole('button', { name: '回到主讲进度' }).click()
    await expect(present(learner)).toHaveAttribute('data-step', '3')
    await expect(badge(learner)).toContainText('正在跟随主讲')
    await presenter.keyboard.press('ArrowRight')
    await expect(present(learner)).toHaveAttribute('data-section', 'web')

    // The presenter ends the classroom; the learner sees it.
    await presenter.keyboard.press('Escape')
    await panelButton(presenter).click()
    await panel.getByRole('button', { name: '结束课堂' }).click()
    await expect(badge(learner)).toContainText('课堂已结束')
    await expect(panel.getByRole('status')).toHaveText('课堂已结束')
    await close()
  })

  test('in the slides form a learner follows the presenter from slide to slide and click to click, with Slidev\'s state', async ({ browser }) => {
    const { presenter, learner, close } = await people(browser)

    // The classroom is in the presenter view's Presmium panel.
    await presenter.goto(`${slides.url}/presenter/2`)
    await presenter.locator('.pm-presenter-panels summary').click()
    const panel = presenter.locator('[data-panel="presmium.session"]')
    await panel.getByLabel('昵称').fill('王老师')
    await panel.getByRole('button', { name: '创建课堂' }).click()
    await expect(panel.getByRole('img', { name: '加入课堂的二维码' }).locator('svg')).toBeVisible()
    const link = await panel.locator('.pm-session__link').getAttribute('href')

    await learner.goto(`${link}&name=${encodeURIComponent('小红')}`)
    await expect(badge(learner)).toContainText('正在跟随主讲')
    // Slide 2 is the session slide, at its route alias.
    await expect(learner).toHaveURL(/\/session(\?|$)/)
    await expect(panel.getByRole('list', { name: '参与者' })).toContainText('小红')

    // Next slide, then its first click.
    await presenter.keyboard.press('ArrowRight')
    await expect(learner).toHaveURL(/\/3(\?|$)/)
    await presenter.keyboard.press('ArrowRight')
    await expect(learner).toHaveURL(/\/3\?(.*&)?clicks=1(&|$)/)

    // Slidev's synchronized state reaches the learner too: the stage's black screen (`b`).
    await presenter.keyboard.press('b')
    await expect(learner.locator('.pm-stage-black')).toBeVisible()
    await presenter.keyboard.press('b')
    await expect(learner.locator('.pm-stage-black')).toHaveCount(0)
    await close()
  })
})
