import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import type { Browser, Page } from '@playwright/test'
import { build, FIXTURES, serve, startClassroomServer, writeDeck, writePage } from './fixtures/plugins/decks.ts'
import { WEB } from './urls.ts'

// Classroom features (pages/classroom.md). Without a classroom the demo's quiz is a self-test and
// notes stay in the browser. The classroom tests build a deck of the classroom page whose
// frontmatter points to a real classroom server (`presmium-classroom-server` on a free port, with
// that deck as its deck directory) and drive a presenter and two learners in browser contexts of
// their own. The notebook form is checked in packages/addon-classroom/test. The test decks of
// e2e/fixtures/plugins check the classroom in English, over another session implementation, and
// its notes across edits of the deck.

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

/** The classroom page of the demo as a deck of its own, whose frontmatter names the classroom server. */
function writeClassroomDeck(deck: string, server: string): void {
  writeFileSync(join(deck, '.gitignore'), '*\n')
  cpSync(resolve('examples/demo/pages/classroom.md'), join(deck, 'pages/classroom.md'))
  writeFileSync(join(deck, 'lecture.md'), `---
title: Presmium Classroom Features
lang: zh-CN
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

const sessionButton = (page: Page) => page.getByRole('button', { name: /^课堂/ })
const badge = (page: Page) => page.getByRole('region', { name: '课堂状态' })

interface Lag {
  /** From now on, what the classroom server sends the page waits. */
  hold(): void
  /** Delivers what waited, in order, and stops holding. */
  release(): void
}

/** Relays the page's connections to the classroom server `server`, so its view of the classroom can lag behind. */
async function laggable(page: Page, server: string): Promise<Lag> {
  let held: (() => void)[] | undefined
  await page.routeWebSocket(url => url.href.startsWith(server), (ws) => {
    // What the page sends goes on at once.
    const upstream = ws.connectToServer()
    upstream.onMessage(message => held ? held.push(() => ws.send(message)) : ws.send(message))
  })
  return {
    hold: () => held = [],
    release() {
      const waiting = held ?? []
      held = undefined
      waiting.forEach(send => send())
    },
  }
}

interface Classroom {
  presenter: Page
  /** 小明 */
  a: Page
  /** 小红 */
  b: Page
  room: string
  /** The join link. */
  link: string
  close(): Promise<void>
}

/**
 * The presenter creates a classroom on `start` (the session panel is in the toolbar of the web form,
 * in the presenter view's panels of the slides form); two learners join with its link. `prepare`
 * runs on each learner's page before it joins.
 */
async function classroom(browser: Browser, start: string, form: 'web' | 'slides', prepare?: (learner: Page) => Promise<void>): Promise<Classroom> {
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
    await prepare?.(learner)
    await learner.goto(`${link}&name=${encodeURIComponent(name)}`)
    await expect(badge(learner)).toContainText('正在跟随主讲')
  }
  return { presenter, a, b, room, link, close: async () => void await Promise.all(contexts.map(context => context.close())) }
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
    writeClassroomDeck(deck, server.url)
    await build(deck, 'web,slides')
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
    const lags = new Map<Page, Lag>()
    const { presenter, a, b, close } = await classroom(browser, `${web.url}/classroom.html`, 'web', async learner => void lags.set(learner, await laggable(learner, server.url)))
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

    // 小红's view lags: she still sees the quiz open after the presenter closed it, and changes her answer.
    const lag = lags.get(b)!
    lag.hold()
    await quiz(presenter).getByRole('button', { name: '关闭作答' }).click()
    await expect(quiz(a).getByRole('status')).toHaveText('作答已关闭，你的答案正确')
    await quiz(b).getByRole('radio', { name: /次数最多/ }).check()
    await quiz(b).getByRole('button', { name: '提交' }).click()
    await expect(quiz(b).getByRole('status')).toHaveText('已提交 B，作答关闭前可以修改')
    // The late answer reaches the room but not the result, which closing froze.
    await expect(quiz(presenter).locator('.pm-quiz__late')).toHaveText('关闭后送达的作答 1 份，未计入')
    await expect(quiz(presenter).locator('.pm-quiz__tally')).toHaveText('已作答 2 人，答对 1 人')
    await expect(quiz(presenter).locator('.pm-quiz__count')).toHaveText(['0 人', '1 人', '1 人'])

    // Closed: everyone sees the tally and the right option; nobody can answer.
    lag.release()
    await expect(quiz(b).getByRole('status')).toHaveText('作答已关闭，你的答案错误；关闭后送达的作答未计入')
    await expect(quiz(b).getByRole('radio', { name: /次数最少/ })).toBeChecked()
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
    const { a, b, link, close } = await classroom(browser, `${web.url}/classroom.html`, 'web')
    await browseAlone(a, b)
    const mine = noteSpot(a, 'classroom-questions', 'merge-rule')
    await addNote(a, mine, 'merge-rule', '频率相同时怎么办？')
    await expect(mine.locator('.pm-note-spot__where')).toHaveText('保存在课堂与这个浏览器中，只有你能看到')

    const theirs = noteSpot(b, 'classroom-questions', 'merge-rule')
    await theirs.getByRole('button', { name: '笔记：merge-rule' }).click()
    await expect(theirs.getByLabel('新笔记')).toBeVisible()
    await expect(theirs.getByRole('list', { name: '我的笔记' })).toHaveCount(0)
    await expect(theirs).toHaveAttribute('data-notes', '0')

    // The tab stays in the classroom after a reload, and so do its notes.
    await a.reload()
    await expect(badge(a)).toBeVisible()
    await expect(noteSpot(a, 'classroom-questions', 'merge-rule')).toHaveAttribute('data-notes', '1')
    // Another tab of the same browser joins as another participant and finds the notes too.
    const tab = await a.context().newPage()
    await tab.goto(`${link}&name=${encodeURIComponent('小明')}`)
    await expect(badge(tab)).toContainText('正在跟随主讲')
    await expect(noteSpot(tab, 'classroom-questions', 'merge-rule')).toHaveAttribute('data-notes', '1')
    await close()
  })

  test('an ended classroom takes no more questions, archiving writes it to the deck directory, and notes stay', async ({ browser }) => {
    const { presenter, a, room, close } = await classroom(browser, `${web.url}/classroom.html`, 'web')
    await browseAlone(a)
    const notes = noteSpot(a, 'classroom-quiz')
    await addNote(a, notes, '课堂测验', '课上记的笔记')
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
    // Archiving frees the learner's own store on the server, not the notes this browser kept.
    await expect(notes.getByRole('list', { name: '我的笔记' })).toContainText('课上记的笔记')
    await expect(notes.locator('.pm-note-spot__where')).toHaveText('保存在这个浏览器中，只有你能看到')
    await notes.getByLabel('新笔记').fill('课后补充')
    await notes.getByRole('button', { name: '保存笔记' }).click()
    await a.reload()
    await expect(noteSpot(a, 'classroom-quiz')).toHaveAttribute('data-notes', '2')
    await close()
  })

  test('a projector tab that the presenter opens by URL shows the presenter\'s quiz, not a self-test', async ({ browser }) => {
    const { presenter, a, close } = await classroom(browser, `${web.url}/classroom.html`, 'web')
    await browseAlone(a)
    // Another tab of the presenter's browser, as a projector shows the present view.
    const projector = await presenter.context().newPage()
    await projector.goto(`${web.url}/classroom.html?view=present&section=classroom-quiz`)
    const shown = projector.getByRole('region', { name: '放映' }).locator('.pm-quiz')
    await expect(shown.getByRole('status')).toHaveText('尚未开放作答')
    await expect(badge(projector)).toHaveCount(0)

    await quiz(presenter).getByRole('button', { name: '开放作答' }).click()
    await expect(shown.getByRole('status')).toHaveText('作答中')
    await quiz(a).getByRole('radio', { name: /次数最多/ }).check()
    await quiz(a).getByRole('button', { name: '提交' }).click()
    await expect(shown.locator('.pm-quiz__tally')).toHaveText('已作答 1 人，答对 1 人')
    // The room sees the right answer only once the quiz is closed.
    await expect(shown.locator('[data-correct]')).toHaveCount(0)
    await quiz(presenter).getByRole('button', { name: '关闭作答' }).click()
    await expect(shown.locator('[data-correct]')).toHaveAttribute('data-option', 'B')
    await close()
  })

  test('in the slides form a quiz round runs between the presenter view and the learners\' slides', async ({ browser }) => {
    const index = sections['classroom-quiz']!
    const { presenter, a, b, close } = await classroom(browser, `${slides.url}/presenter/${index}`, 'slides')
    for (const learner of [a, b]) await expect(learner).toHaveURL(new RegExp(`/${index}(\\?|$)`))
    await expect(quiz(a).getByRole('status')).toHaveText('等待主讲开放作答')
    // The audience window of the presenter's browser, opened by URL as Slidev suggests for a projector.
    const projector = await presenter.context().newPage()
    await projector.goto(`${slides.url}/${index}`)
    await expect(quiz(projector).getByRole('status')).toHaveText('尚未开放作答')

    await quiz(presenter).getByRole('button', { name: '开放作答' }).click()
    await quiz(a).getByRole('radio', { name: /次数最多/ }).check()
    await quiz(a).getByRole('button', { name: '提交' }).click()
    await quiz(b).getByRole('radio', { name: /最先出现/ }).check()
    await quiz(b).getByRole('button', { name: '提交' }).click()
    await expect(quiz(presenter).locator('.pm-quiz__tally')).toHaveText('已作答 2 人，答对 1 人')
    await expect(quiz(projector).locator('.pm-quiz__tally')).toHaveText('已作答 2 人，答对 1 人')
    await quiz(presenter).getByRole('button', { name: '关闭作答' }).click()
    await expect(quiz(a).getByRole('status')).toHaveText('作答已关闭，你的答案正确')
    await expect(quiz(b).getByRole('button', { name: '提交' })).toBeDisabled()
    // The presenter view's panel lists the quiz too.
    await presenter.locator('.pm-presenter-panels summary').click()
    await expect(presenter.locator('[data-panel="presmium.classroom"]')).toContainText(`第 ${index} 节 · 课堂测验：已关闭，已作答 2 人，答对 1 人`)
    await close()
  })
})

// ---------------------------------------------------------------------------
// Test decks of e2e/fixtures/plugins
// ---------------------------------------------------------------------------

test.describe('an English deck', () => {
  test.describe.configure({ mode: 'serial', timeout: 120_000 })
  let server: Awaited<ReturnType<typeof startClassroomServer>>
  let deck: string
  let web: Awaited<ReturnType<typeof serve>>

  // With the session and the classroom, but no executor.
  test.beforeAll(async () => {
    test.setTimeout(240_000)
    server = await startClassroomServer()
    deck = writeDeck('english', `
title: Classroom in English
lang: en-US
plugins:
  - '@presmium/slidev-addon-core'
  - '@presmium/slidev-addon-session'
  - '@presmium/slidev-addon-classroom'
presmium:
  presmium.session:
    server: ${server.url}
renderers:
  web:
    lang: en-US
`, ['quiz.md'])
    await build(deck)
    web = await serve(join(deck, 'dist/web'))
  })

  test.afterAll(async () => {
    await web?.close()
    server?.child.kill('SIGTERM')
    if (deck) rmSync(deck, { recursive: true, force: true })
  })

  test('the session panel, the join form and the quiz speak the deck\'s language, not the browser\'s (N-07)', async ({ browser }) => {
    const contexts = await Promise.all([browser.newContext({ locale: 'zh-CN' }), browser.newContext({ locale: 'zh-CN' })])
    const [presenter, learner] = await Promise.all(contexts.map(context => context.newPage())) as [Page, Page]
    await presenter.goto(`${web.url}/quiz.html`)
    await expect(presenter.locator('html')).toHaveAttribute('lang', 'en-US')
    await presenter.getByRole('button', { name: /^Classroom/ }).click()
    const panel = presenter.getByRole('dialog', { name: 'Classroom' })
    await expect(panel.getByRole('status')).toHaveText('Not connected: not in a classroom')
    await panel.getByLabel('Nickname').fill('Ms. Wang')
    await panel.getByRole('button', { name: 'Create classroom' }).click()
    await expect(panel.getByRole('status')).toHaveText('Classroom in progress, you are presenting')
    await expect(panel.getByRole('img', { name: 'QR code to join the classroom' }).locator('svg')).toBeVisible()

    const link = (await panel.locator('.pm-session__link').getAttribute('href'))!
    await learner.goto(link)
    const status = learner.getByRole('region', { name: 'Classroom status' })
    await status.getByLabel('Nickname').fill('Ming')
    await status.getByRole('button', { name: 'Join classroom' }).click()
    await expect(status).toContainText('Following the presenter')
    await expect(panel.getByRole('list', { name: 'Participants' })).toContainText('Ming')
    await panel.getByRole('button', { name: 'Close' }).click()

    await expect(quiz(presenter).getByRole('status')).toHaveText('Not open for answers yet')
    await expect(quiz(learner).getByRole('status')).toHaveText('Waiting for the presenter to open the quiz')
    await quiz(presenter).getByRole('button', { name: 'Open answering' }).click()
    await expect(quiz(learner).getByRole('status')).toHaveText('Answering: choose, then submit')
    await quiz(learner).getByRole('radio', { name: /most frequent/ }).check()
    await quiz(learner).getByRole('button', { name: 'Submit' }).click()
    await expect(quiz(learner).getByRole('status')).toHaveText('Submitted B; you can change it until answering closes')
    await expect(quiz(presenter).locator('.pm-quiz__tally')).toHaveText('1 answered, 1 right')
    await quiz(presenter).getByRole('button', { name: 'Close answering' }).click()
    await expect(quiz(learner).getByRole('status')).toHaveText('Answering closed, your answer is right')
    await Promise.all(contexts.map(context => context.close()))
  })

  test('the classroom plugin starts degraded without an executor and says which service is missing', async ({ page }) => {
    await page.goto(`${web.url}/quiz.html?view=presenter&section=quiz`)
    await page.locator('.pm-presenter-panels summary').click()
    const report = page.locator('.pm-start-report')
    await expect(report.locator('[data-plugin="presmium.session"]')).toHaveAttribute('data-status', 'started')
    const classroom = report.locator('[data-plugin="presmium.classroom"]')
    await expect(classroom).toHaveAttribute('data-status', 'degraded')
    await expect(classroom).toContainText('presmium.executor')
    await expect(classroom).not.toContainText('presmium.session')
  })
})

test.describe('another session implementation', () => {
  test.describe.configure({ timeout: 120_000 })
  let deck: string
  let web: Awaited<ReturnType<typeof serve>>

  // The fixture plugin provides `session` and `classroomStore` in place of addon-session.
  test.beforeAll(async () => {
    test.setTimeout(240_000)
    deck = writeDeck('memory-session', `
title: Memory classroom
plugins:
  - '@presmium/slidev-addon-core'
  - '@presmium/slidev-addon-exec'
  - '@presmium/slidev-addon-classroom'
  - '${join(FIXTURES, 'memory-session')}'
renderers:
  web: {}
`, ['quiz.md'])
    await build(deck)
    web = await serve(join(deck, 'dist/web'))
  })

  test.afterAll(async () => {
    await web?.close()
    if (deck) rmSync(deck, { recursive: true, force: true })
  })

  test('runs a quiz round with the quiz unchanged, and the start report shows the provider that replaced addon-session (K-08)', async ({ browser }) => {
    // Tabs of one browser, where the in-memory classroom lives.
    const context = await browser.newContext()
    const presenter = await context.newPage()
    await presenter.goto(`${web.url}/quiz.html?as=presenter`)
    const learner = await context.newPage()
    await learner.goto(`${web.url}/quiz.html?as=${encodeURIComponent('小明')}`)
    await expect(quiz(learner).getByRole('status')).toHaveText('等待主讲开放作答')
    await quiz(presenter).getByRole('button', { name: '开放作答' }).click()
    await expect(quiz(learner).getByRole('status')).toHaveText('作答中：选择后提交')
    await quiz(learner).getByRole('radio', { name: /most frequent/ }).check()
    await quiz(learner).getByRole('button', { name: '提交' }).click()
    await expect(quiz(presenter).locator('.pm-quiz__tally')).toHaveText('已作答 1 人，答对 1 人')
    await quiz(presenter).getByRole('button', { name: '关闭作答' }).click()
    await expect(quiz(learner).getByRole('status')).toHaveText('作答已关闭，你的答案正确')

    await presenter.goto(`${web.url}/quiz.html?view=presenter&section=quiz&as=presenter`)
    await presenter.locator('.pm-presenter-panels summary').click()
    const report = presenter.locator('.pm-start-report')
    await expect(report.locator('[data-plugin="fixture.memory-session"]')).toHaveAttribute('data-status', 'started')
    await expect(report.locator('[data-plugin="presmium.session"]')).toHaveCount(0)
    // The classroom found every service it asks for.
    await expect(report.locator('[data-plugin="presmium.classroom"]')).toHaveAttribute('data-status', 'started')
    await context.close()
  })
})

const CART = `// #region total
export function total(prices: number[]): number {
  return prices.reduce((sum, price) => sum + price, 0)
}
// #endregion total
`

test('notes stay attached to their section and to a labelled code block when the deck and the code change (P-63)', async ({ page }) => {
  // Two builds.
  test.setTimeout(480_000)
  const deck = writeDeck('notes', `
title: Notes
plugins:
  - '@presmium/slidev-addon-core'
  - '@presmium/slidev-addon-code'
  - '@presmium/slidev-addon-classroom'
renderers:
  web: {}
`, ['notes.md'])
  mkdirSync(join(deck, 'src'))
  writeFileSync(join(deck, 'src/cart.ts'), CART)
  await build(deck)
  // The same address after the rebuild: notes are kept per site.
  const web = await serve(join(deck, 'dist/web'))
  try {
    await page.goto(`${web.url}/notes.html`)
    await addNote(page, noteSpot(page, 'cart'), 'Cart', 'The total is a sum')
    await addNote(page, noteSpot(page, 'cart', 'cart-total'), 'cart-total', 'reduce starts at 0')

    // A new section before it, a paragraph before the block, a comment above the code and a change in it.
    writePage(deck, 'notes.md', text => `(intro)=\n## Introduction\n\nA new first section.\n\n${text.replace('The cart adds', 'A new paragraph.\n\nThe cart adds')}`)
    writeFileSync(join(deck, 'src/cart.ts'), `// Prices are in cents.\n\n${CART.replace('sum + price', 'sum + Math.round(price)')}`)
    await build(deck)
    await page.reload()
    await expect(page.locator('.pm-section[data-section="intro"]')).toBeVisible()
    await expect(page.locator('.pm-section[data-section="cart"] .pm-block[data-block="cart-total"]')).toContainText('Math.round(price)')
    await expect(noteSpot(page, 'cart')).toHaveAttribute('data-notes', '1')
    const block = noteSpot(page, 'cart', 'cart-total')
    await expect(block).toHaveAttribute('data-notes', '1')
    await block.getByRole('button', { name: '笔记：cart-total' }).click()
    await expect(block.getByRole('list', { name: '我的笔记' })).toHaveText('reduce starts at 0删除')
  } finally {
    await web.close()
    rmSync(deck, { recursive: true, force: true })
  }
})
