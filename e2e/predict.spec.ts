// Predict, then reveal (P-68, WP-88) on the test deck e2e/fixtures/predict, whose headmatter names
// a real classroom server (`presmium-classroom-server` on a free port). In the document view what a
// `{predict}` reveals, the content of the step after it, stays hidden until the reader has saved a
// prediction, which the browser keeps; the present view shows it at its step, as the room sees it,
// without the narration it took in; so do the slides, the prompt before the form. In a classroom
// the learners' predictions reach the presenter's
// overview, and the page reports the classroom's summary, without names, to the Presmium server over
// the control channel (the `STATUS` service that the MCP tool `get_classroom` reads): that test runs
// on `presmium dev`, the static output has no server. The notebook form is checked in
// packages/addon-classroom/test/predict.test.ts.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { buildFixture, openDevPage, openSlide, startDev } from './fixtures/deck.ts'
import type { DevServer, FixtureDeck } from './fixtures/deck.ts'
import { startClassroomServer } from './fixtures/plugins/decks.ts'

const REVEALED = '三个：每一轮新增一个符号。'
const NARRATION = '每一轮只合并出现最多的那一对，所以三轮新增三个符号。'

const predict = (page: Page, question: string) => page.locator('.pm-predict').filter({ hasText: question })
const merge = (page: Page) => predict(page, '合并三轮之后')
const badge = (page: Page) => page.getByRole('region', { name: '课堂状态' })

test.describe.configure({ mode: 'serial' })

let server: Awaited<ReturnType<typeof startClassroomServer>>
let deck: FixtureDeck

test.beforeAll(async () => {
  test.setTimeout(600_000)
  server = await startClassroomServer()
  deck = await buildFixture('predict', {
    to: 'web,slides',
    edit: (dir) => {
      const file = join(dir, 'lecture.md')
      writeFileSync(file, readFileSync(file, 'utf8').replace('ws://classroom.invalid', server.url))
    },
  })
})

test.afterAll(async () => {
  await deck?.close()
  server?.child.kill('SIGTERM')
})

test('the document view shows what a predict reveals once the reader has saved a choice, and again after a reload', async ({ page }) => {
  await page.goto(`${deck.web}/`)
  const save = merge(page).getByRole('button', { name: '保存预测' })
  await expect(save).toBeDisabled()
  await expect(page.getByText(REVEALED)).toBeHidden()
  await expect(page.getByText(NARRATION)).toBeHidden()
  await expect(merge(page).getByRole('status')).toHaveCount(0)

  await merge(page).getByRole('radio', { name: '2', exact: true }).check()
  await save.click()
  await expect(merge(page).getByRole('status')).toHaveText('你的预测：2，预测保存在这个浏览器中')
  await expect(page.getByText(REVEALED)).toBeVisible()
  await expect(page.getByText(NARRATION)).toBeVisible()
  await expect(merge(page).getByRole('radio', { name: '3', exact: true })).toBeDisabled()

  await page.reload()
  await expect(merge(page).getByRole('radio', { name: '2', exact: true })).toBeChecked()
  await expect(page.getByText(REVEALED)).toBeVisible()
})

test('the present view shows what a predict reveals at its step, without a prediction, and leaves its narration off the screen', async ({ page }) => {
  const stage = page.getByRole('region', { name: '放映' })
  await page.goto(`${deck.web}/?view=present&section=merge&step=0`)
  await expect(stage.locator('.pm-predict')).toBeVisible()
  await expect(stage.getByText(REVEALED)).toBeHidden()
  await page.goto(`${deck.web}/?view=present&section=merge&step=1`)
  await expect(stage.getByText(REVEALED)).toBeVisible()
  await expect(stage.getByText(NARRATION)).toHaveCount(0)
})

test('in the slides, a predict\'s prompt stands between its question and its form, and what it reveals shows at its step', async ({ page }) => {
  const REVEAL = '从字符开始，任何词都能切分，不会遇到词表之外的词。'
  /** The click wrapper of what the predict reveals, which Slidev hides with a class until its step. */
  const wrapper = (predict: Locator) => predict.locator('.pm-predict__reveal > div', { hasText: REVEAL })
  const why = (await openSlide(page, deck, 'why', '从字符开始', '?clicks=0')).locator('.pm-predict')
  const top = async (text: string) => (await why.getByText(text).boundingBox())!.y
  expect(await top('为什么 BPE 从单个字符开始合并？')).toBeLessThan(await top('写一句话就好。'))
  expect(await top('写一句话就好。')).toBeLessThan((await why.getByLabel('你的预测').boundingBox())!.y)
  await expect(wrapper(why)).toHaveClass(/slidev-vclick-hidden/)
  const shown = (await openSlide(page, deck, 'why', '从字符开始', '?clicks=1')).locator('.pm-predict')
  await expect(wrapper(shown)).not.toHaveClass(/slidev-vclick-hidden/)
})

test('a predict without choices shows what it reveals once the reader has written a prediction and saved it', async ({ page }) => {
  await page.goto(`${deck.web}/`)
  const why = predict(page, '为什么 BPE 从单个字符开始合并？')
  const revealed = page.getByText('从字符开始，任何词都能切分，不会遇到词表之外的词。')
  await expect(why.getByRole('button', { name: '保存预测' })).toBeDisabled()
  await expect(revealed).toBeHidden()
  await why.getByLabel('你的预测').fill('字符是最小的单位')
  await why.getByRole('button', { name: '保存预测' }).click()
  await expect(why.getByRole('status')).toHaveText('你的预测：字符是最小的单位，预测保存在这个浏览器中')
  await expect(revealed).toBeVisible()
})

test.describe('in a classroom', () => {
  let dev: DevServer

  test.beforeAll(async () => {
    test.setTimeout(300_000)
    dev = await startDev(deck.dir, 'web')
  })

  test.afterAll(async () => {
    await dev?.stop()
  })

  test('two learners predict 2 and 3: the presenter\'s overview shows one each, and the page reports the counts without names', async ({ browser }) => {
    test.setTimeout(240_000)
    const contexts = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()])
    const [presenter, a, b] = await Promise.all(contexts.map(context => context.newPage())) as [Page, Page, Page]
    // What the presenter's page reports to the Presmium server over the control channel.
    const reports: unknown[] = []
    presenter.on('request', (request) => {
      const body = request.method() === 'POST' && request.url().endsWith('/__presmium/presmium.server/control') ? request.postDataJSON() as { type?: string, status?: Record<string, unknown> } : undefined
      if (body?.type === 'report') reports.push(body.status?.['presmium.classroom'])
    })
    await openDevPage(presenter, dev.url, merge(presenter).getByRole('button', { name: '保存预测' }))

    await presenter.getByRole('button', { name: /^课堂/ }).click()
    const panel = presenter.getByRole('dialog', { name: '课堂' })
    await panel.getByLabel('昵称').fill('王老师')
    await panel.getByRole('button', { name: '创建课堂' }).click()
    const link = (await panel.locator('.pm-session__link').getAttribute('href'))!
    await panel.getByRole('button', { name: '关闭' }).click()

    for (const [learner, name, choice] of [[a, '小明', '2'], [b, '小红', '3']] as const) {
      await learner.goto(`${link}&name=${encodeURIComponent(name)}`)
      await expect(badge(learner)).toContainText('正在跟随主讲')
      // Browsing alone, the presenter's scrolling does not move the learner.
      await badge(learner).getByRole('button', { name: '自主浏览' }).click()
      await expect(badge(learner)).toContainText('自主浏览中')
      await expect(learner.getByText(REVEALED)).toBeHidden()
      await merge(learner).getByRole('radio', { name: choice, exact: true }).check()
      await merge(learner).getByRole('button', { name: '保存预测' }).click()
      await expect(merge(learner).getByRole('status')).toHaveText(`你的预测：${choice}，预测保存在这个浏览器中，并已交给主讲`)
      await expect(learner.getByText(REVEALED)).toBeVisible()
    }

    await presenter.getByRole('button', { name: /^互动/ }).click()
    const predictions = presenter.getByRole('dialog', { name: '课堂互动' }).getByRole('region', { name: '预测' })
    await expect(predictions.locator('.pm-classroom-panel__where')).toHaveText('第 2 节 · 合并三轮：已预测 2 人')
    await expect(predictions.getByRole('listitem')).toHaveText(['1：0 人', '2：1 人', '3：1 人'])

    // The summary the page reports names no learner.
    await expect.poll(() => (reports.at(-1) as { predictions?: { counts?: number[] }[] } | undefined)?.predictions?.[0]?.counts, { timeout: 10_000 }).toEqual([0, 1, 1])
    const summary = reports.at(-1) as Record<string, unknown>
    expect(summary).toMatchObject({ status: 'active', learners: 2, predictions: [{ question: '合并三轮之后，词表中有几个新符号？', choices: ['1', '2', '3'], respondents: 2 }] })
    expect(JSON.stringify(summary)).not.toMatch(/小明|小红/)
    await Promise.all(contexts.map(context => context.close()))
  })
})
