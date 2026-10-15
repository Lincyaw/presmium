import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { cpSync, createReadStream, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { extname, join, resolve, sep } from 'node:path'
import { expect, test } from '@playwright/test'
import type { Browser, Page } from '@playwright/test'
import { WEB } from './urls.ts'

// Classroom features (pages/classroom.md). Without a classroom the demo's quiz is a self-test and
// notes stay in the browser. The classroom tests build a deck of the classroom page whose
// frontmatter points to a real classroom server (`presmium-classroom-server` on a free port, with
// that deck as its deck directory) and drive a presenter and two learners in browser contexts of
// their own. The notebook form is checked in packages/addon-classroom/test.

/** Loading the Python runtime for the first check takes a few seconds. */
const RUNTIME = { timeout: 30_000 }

const quiz = (page: Page) => page.locator('.pm-quiz').filter({ visible: true })
const noteSpot = (page: Page, section: string, block?: string) =>
  page.locator(block ? `.pm-note-spot[data-section="${section}"][data-block="${block}"]` : `.pm-note-spot[data-section="${section}"]:not([data-block])`)

async function addNote(page: Page, spot: ReturnType<typeof noteSpot>, label: string, text: string): Promise<void> {
  await spot.getByRole('button', { name: `笔记：${label}` }).click()
  await spot.getByLabel('新笔记').fill(text)
  await spot.getByRole('button', { name: '保存笔记' }).click()
  await expect(spot.getByRole('list', { name: '我的笔记' })).toContainText(text)
}

test('without a classroom the quiz is a self-test and notes stay in this browser', async ({ page }) => {
  await page.goto(`${WEB}/classroom.html`)
  await quiz(page).getByRole('radio', { name: /最先出现/ }).check()
  await quiz(page).getByRole('button', { name: '提交' }).click()
  await expect(quiz(page).getByRole('status')).toHaveText('回答错误，正确答案是 B')
  await quiz(page).getByRole('radio', { name: /次数最多/ }).check()
  await quiz(page).getByRole('button', { name: '提交' }).click()
  await expect(quiz(page).getByRole('status')).toHaveText('回答正确')

  // Every section has a note spot, and so has the labelled block; a note survives a reload.
  await expect(noteSpot(page, 'classroom-questions', 'merge-rule')).toHaveCount(1)
  await addNote(page, noteSpot(page, 'classroom-quiz'), '课堂测验', '合并看的是频率')
  await expect(noteSpot(page, 'classroom-quiz').locator('.pm-note-spot__where')).toHaveText('保存在这个浏览器中，只有你能看到')
  await page.reload()
  await expect(noteSpot(page, 'classroom-quiz')).toHaveAttribute('data-notes', '1')
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
  '.wasm': 'application/wasm',
  '.zip': 'application/zip',
  '.woff2': 'font/woff2',
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

/** `presmium-classroom-server --port 0 --deck <deck>`, until it prints its URL. */
async function startClassroomServer(deck: string): Promise<{ url: string, child: ChildProcess }> {
  const child = spawn(process.execPath, [resolve('packages/classroom-server/bin/server.mjs'), '--port', '0', '--host', '127.0.0.1', '--deck', deck], { stdio: ['ignore', 'pipe', 'inherit'] })
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

/** The classroom page of the demo as a deck of its own, whose frontmatter names the classroom server. */
function writeDeck(deck: string, server: string): void {
  writeFileSync(join(deck, '.gitignore'), '*\n')
  cpSync(resolve('examples/demo/pages/classroom.md'), join(deck, 'pages/classroom.md'))
  writeFileSync(join(deck, 'lecture.md'), `---
title: Presmium Classroom Features
plugins:
  - '@presmium/slidev-addon-core'
  - '@presmium/slidev-addon-exec'
  - '@presmium/slidev-addon-session'
  - '@presmium/slidev-addon-classroom'
presmium:
  presmium.session:
    server: ${server}
renderers:
  web: {}
  slides:
    theme: default
---

# Presmium Classroom Features

课堂互动演示文稿。

\`\`\`{include} pages/classroom.md
\`\`\`
`)
}

async function build(deck: string): Promise<void> {
  const child = spawn(process.execPath, [resolve('packages/cli/bin/presmium.mjs'), 'build', '--to', 'web,slides'], { cwd: deck, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  child.stdout!.on('data', (chunk: Buffer) => output += chunk)
  child.stderr!.on('data', (chunk: Buffer) => output += chunk)
  const code = await new Promise<number | null>(done => child.once('exit', done))
  if (code !== 0) throw new Error(`presmium build exited (${code}):\n${output}`)
}

const sessionButton = (page: Page) => page.getByRole('button', { name: /^课堂/ })
const badge = (page: Page) => page.getByRole('region', { name: '课堂状态' })

interface Classroom {
  presenter: Page
  /** 小明 */
  a: Page
  /** 小红 */
  b: Page
  room: string
  close(): Promise<void>
}

/**
 * The presenter creates a classroom on `start` (the session panel is in the toolbar of the web form,
 * in the presenter view's panels of the slides form); two learners join with its link.
 */
async function classroom(browser: Browser, start: string, form: 'web' | 'slides'): Promise<Classroom> {
  const contexts = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()])
  const [presenter, a, b] = await Promise.all(contexts.map(context => context.newPage())) as [Page, Page, Page]
  await presenter.goto(start)
  let panel
  if (form === 'web') {
    await sessionButton(presenter).click()
    panel = presenter.getByRole('dialog', { name: '课堂' })
  } else {
    await presenter.locator('.pm-presenter-panels summary').click()
    panel = presenter.locator('[data-panel="presmium.session"]')
  }
  await panel.getByLabel('昵称').fill('王老师')
  await panel.getByRole('button', { name: '创建课堂' }).click()
  await expect(panel.getByRole('img', { name: '加入课堂的二维码' }).locator('svg')).toBeVisible()
  const link = (await panel.locator('.pm-session__link').getAttribute('href'))!
  const room = new URL(link).searchParams.get('room')!
  // Out of the way of the slide.
  if (form === 'web') await panel.getByRole('button', { name: '关闭' }).click()
  else await presenter.locator('.pm-presenter-panels summary').click()
  for (const [learner, name] of [[a, '小明'], [b, '小红']] as const) {
    await learner.goto(`${link}&name=${encodeURIComponent(name)}`)
    await expect(badge(learner)).toContainText('正在跟随主讲')
  }
  return { presenter, a, b, room, close: async () => void await Promise.all(contexts.map(context => context.close())) }
}

/** In the web form the learners browse the classroom page on their own, so the presenter's scrolling does not move them. */
async function browseAlone(...learners: Page[]): Promise<void> {
  for (const learner of learners) {
    await expect(learner).toHaveURL(/\/classroom\.html/)
    await badge(learner).getByRole('button', { name: '自主浏览' }).click()
    await expect(badge(learner)).toContainText('自主浏览中')
  }
}

test.describe('a classroom', () => {
  test.describe.configure({ mode: 'serial', timeout: 120_000 })
  let server: Awaited<ReturnType<typeof startClassroomServer>>
  let deck: string
  let web: Awaited<ReturnType<typeof serve>>
  let slides: Awaited<ReturnType<typeof serve>>
  let sections: Record<string, number>

  test.beforeAll(async () => {
    test.setTimeout(240_000)
    const work = resolve('examples/demo/.presmium')
    mkdirSync(work, { recursive: true })
    deck = mkdtempSync(join(work, 'e2e-classroom-'))
    server = await startClassroomServer(deck)
    writeDeck(deck, server.url)
    await build(deck)
    const ir = JSON.parse(readFileSync(join(deck, 'dist/ir.json'), 'utf8')) as { sections: { id: string, index: number }[] }
    sections = Object.fromEntries(ir.sections.map(s => [s.id, s.index]))
    web = await serve(join(deck, 'dist/web'), false)
    slides = await serve(join(deck, 'dist/slides'), true)
  })

  test.afterAll(async () => {
    await web?.close()
    await slides?.close()
    server?.child.kill('SIGTERM')
    if (deck) rmSync(deck, { recursive: true, force: true })
  })

  test('a quiz round counts each learner\'s last answer and takes no answers once closed', async ({ browser }) => {
    const { presenter, a, b, close } = await classroom(browser, `${web.url}/classroom.html`, 'web')
    await browseAlone(a, b)
    await expect(quiz(a).getByRole('status')).toHaveText('等待主讲开放作答')
    await quiz(presenter).getByRole('button', { name: '开放作答' }).click()
    await expect(quiz(a).getByRole('status')).toHaveText('作答中：选择后提交')

    // 小明 answers twice; only his last answer counts.
    await quiz(a).getByRole('radio', { name: /最先出现/ }).check()
    await quiz(a).getByRole('button', { name: '提交' }).click()
    await expect(quiz(a).getByRole('status')).toHaveText('已提交 A，作答关闭前可以修改')
    await quiz(a).getByRole('radio', { name: /次数最多/ }).check()
    await quiz(a).getByRole('button', { name: '提交' }).click()
    await quiz(b).getByRole('radio', { name: /次数最少/ }).check()
    await quiz(b).getByRole('button', { name: '提交' }).click()
    await expect(quiz(presenter).locator('.pm-quiz__tally')).toHaveText('已作答 2 人，答对 1 人')
    await expect(quiz(presenter).locator('.pm-quiz__count')).toHaveText(['0 人', '1 人', '1 人'])

    // Closed: everyone sees the tally and the right option; nobody can answer.
    await quiz(presenter).getByRole('button', { name: '关闭作答' }).click()
    await expect(quiz(a).getByRole('status')).toHaveText('作答已关闭，你的答案正确')
    await expect(quiz(b).getByRole('status')).toHaveText('作答已关闭，你的答案错误')
    await expect(quiz(b).locator('.pm-quiz__tally')).toHaveText('已作答 2 人，答对 1 人')
    await expect(quiz(b).locator('[data-correct]')).toHaveAttribute('data-option', 'B')
    await expect(quiz(b).getByRole('radio', { name: /次数最多/ })).toBeDisabled()
    await expect(quiz(b).getByRole('button', { name: '提交' })).toBeDisabled()
    await close()
  })

  test('a question appears in the presenter\'s view under its section, next to the understanding pulse', async ({ browser }) => {
    const { presenter, a, b, close } = await classroom(browser, `${web.url}/classroom.html`, 'web')
    await browseAlone(a, b)
    const box = a.locator('.pm-question-box')
    await box.getByLabel('问题').fill('频率相同的两对先合并哪一对？')
    await box.getByRole('button', { name: '提问' }).click()
    await expect(box.getByRole('list', { name: '我的提问' })).toContainText('频率相同的两对先合并哪一对？')
    // Another learner does not get it in the question box.
    await expect(b.locator('.pm-question-box').getByRole('list')).toHaveCount(0)
    await a.locator('.pm-pulse').getByRole('button', { name: '懂了' }).click()
    await b.locator('.pm-pulse').getByRole('button', { name: '没懂' }).click()
    await b.locator('.pm-pulse').getByRole('button', { name: '有点模糊' }).click()

    await presenter.getByRole('button', { name: /^互动/ }).click()
    const overview = presenter.getByRole('dialog', { name: '课堂互动' })
    const asked = overview.getByRole('region', { name: '提问' }).locator('.pm-classroom-panel__place')
    await expect(asked.locator('.pm-classroom-panel__where')).toHaveText(`第 ${sections['classroom-questions']} 节 · 提问与理解度 · merge-rule`)
    await expect(asked.getByRole('listitem')).toHaveText(/^小明：频率相同的两对先合并哪一对？/)
    await expect(overview.getByRole('region', { name: '理解度' })).toContainText('懂了 1 人 · 有点模糊 1 人 · 没懂 0 人')
    // The pulse on the page shows the presenter the same distribution.
    await expect(presenter.locator('.pm-pulse [data-level="有点模糊"]')).toHaveAttribute('data-count', '1')
    await close()
  })

  test('a submitted exercise returns its check result with the typical error, to the learner and the presenter', async ({ browser }) => {
    const { presenter, a, close } = await classroom(browser, `${web.url}/classroom.html`, 'web')
    await browseAlone(a)
    const exercise = a.locator('.pm-exercise')
    await exercise.getByRole('button', { name: '提交' }).click()
    await expect(exercise.locator('.pm-exercise__verdict')).toHaveText('未通过 1/2', RUNTIME)
    const failed = exercise.locator('.pm-exercise__cases li[data-ok="false"]')
    await expect(failed).toContainText('assert mean([]) == 0')
    await expect(failed.locator('.pm-exercise__error')).toHaveAttribute('data-kind', '除以零')
    await expect(presenter.locator('.pm-exercise__summary')).toHaveText('已提交 1 人，通过 0 人；常见错误：除以零 1 人')

    await exercise.getByLabel('练习代码').fill('def mean(xs):\n    return sum(xs) / len(xs) if xs else 0')
    await exercise.getByRole('button', { name: '提交' }).click()
    await expect(exercise.locator('.pm-exercise__verdict')).toHaveText('通过 2/2', RUNTIME)
    await expect(presenter.locator('.pm-exercise__summary')).toHaveText('已提交 1 人，通过 1 人')
    await close()
  })

  test('a learner\'s notes are theirs alone, and stay with them in the classroom', async ({ browser }) => {
    const { a, b, close } = await classroom(browser, `${web.url}/classroom.html`, 'web')
    await browseAlone(a, b)
    const mine = noteSpot(a, 'classroom-questions', 'merge-rule')
    await addNote(a, mine, 'merge-rule', '频率相同时怎么办？')
    await expect(mine.locator('.pm-note-spot__where')).toHaveText('保存在课堂中，只有你能看到')

    const theirs = noteSpot(b, 'classroom-questions', 'merge-rule')
    await theirs.getByRole('button', { name: '笔记：merge-rule' }).click()
    await expect(theirs.getByLabel('新笔记')).toBeVisible()
    await expect(theirs.getByRole('list', { name: '我的笔记' })).toHaveCount(0)
    await expect(theirs).toHaveAttribute('data-notes', '0')

    // The tab stays in the classroom after a reload, and so do its notes.
    await a.reload()
    await expect(badge(a)).toBeVisible()
    await expect(noteSpot(a, 'classroom-questions', 'merge-rule')).toHaveAttribute('data-notes', '1')
    await close()
  })

  test('an ended classroom takes no more questions, and archiving writes it to the deck directory', async ({ browser }) => {
    const { presenter, a, room, close } = await classroom(browser, `${web.url}/classroom.html`, 'web')
    await browseAlone(a)
    const box = a.locator('.pm-question-box')
    await box.getByLabel('问题').fill('合并到什么时候停止？')
    await box.getByRole('button', { name: '提问' }).click()
    await expect(box.getByRole('list', { name: '我的提问' })).toContainText('合并到什么时候停止？')

    await sessionButton(presenter).click()
    const panel = presenter.getByRole('dialog', { name: '课堂' })
    await panel.getByRole('button', { name: '结束课堂' }).click()
    await expect(box).toContainText('课堂已结束，不再接受提问')
    await expect(box.getByLabel('问题')).toHaveCount(0)
    await expect(a.locator('.pm-pulse').getByRole('button')).toHaveCount(0)

    await panel.getByRole('button', { name: '归档课堂' }).click()
    const file = `.presmium/classroom/${room}.json`
    await expect(panel.getByRole('status')).toHaveText(`课堂已结束并归档到 ${file}`)
    await expect(badge(a)).toContainText('课堂已结束')
    const archived = JSON.parse(readFileSync(join(deck, file), 'utf8')) as { room: string, document: Record<string, Record<string, { text?: string }>> }
    expect(archived.room).toBe(room)
    expect(Object.values(archived.document['store:questions']!).map(q => q.text)).toEqual(['合并到什么时候停止？'])
    await close()
  })

  test('in the slides form a quiz round runs between the presenter view and the learners\' slides', async ({ browser }) => {
    const index = sections['classroom-quiz']!
    const { presenter, a, b, close } = await classroom(browser, `${slides.url}/presenter/${index}`, 'slides')
    for (const learner of [a, b]) await expect(learner).toHaveURL(new RegExp(`/${index}(\\?|$)`))
    await expect(quiz(a).getByRole('status')).toHaveText('等待主讲开放作答')

    await quiz(presenter).getByRole('button', { name: '开放作答' }).click()
    await quiz(a).getByRole('radio', { name: /次数最多/ }).check()
    await quiz(a).getByRole('button', { name: '提交' }).click()
    await quiz(b).getByRole('radio', { name: /最先出现/ }).check()
    await quiz(b).getByRole('button', { name: '提交' }).click()
    await expect(quiz(presenter).locator('.pm-quiz__tally')).toHaveText('已作答 2 人，答对 1 人')
    await quiz(presenter).getByRole('button', { name: '关闭作答' }).click()
    await expect(quiz(a).getByRole('status')).toHaveText('作答已关闭，你的答案正确')
    await expect(quiz(b).getByRole('button', { name: '提交' })).toBeDisabled()
    // The presenter view's panel lists the quiz too.
    await presenter.locator('.pm-presenter-panels summary').click()
    await expect(presenter.locator('[data-panel="presmium.classroom"]')).toContainText(`第 ${index} 节 · 课堂测验：已关闭，已作答 2 人，答对 1 人`)
    await close()
  })
})
