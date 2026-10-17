// The assistant in the page (WP-80, P-112, N-08) under `presmium dev`, with the scripted test agent as the
// operator's replacement runtime (provider "Test Provider"): a reader selects code in the web form and asks
// about it; the panel names the provider before the question and the runtime after the answer, and the
// answer's citation moves the page to the section it names. A question runs in `tutor` mode, where the
// agent's attempt to write a file is refused and the file stays. In a classroom, a learner's question
// reaches the presenter's overview, whose "AI answer" the presenter sends to the classroom, and the learner
// sees it.
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { deckDir, openDevPage, startDev } from './fixtures/deck.ts'
import type { DevServer } from './fixtures/deck.ts'
import { startClassroomServer } from './fixtures/plugins/decks.ts'

const FIXTURE = fileURLToPath(new URL('./fixtures/assistant', import.meta.url))
const AGENT = fileURLToPath(new URL('../packages/addon-assistant/test/fixtures/scripted-agent.mjs', import.meta.url))

test.describe.configure({ mode: 'serial', timeout: 180_000 })

let dir: string
let log: string
let dev: DevServer
let classroom: Awaited<ReturnType<typeof startClassroomServer>>

test.beforeAll(async () => {
  test.setTimeout(300_000)
  dir = deckDir('assistant', { '@presmium/slidev-addon-assistant': 'packages/addon-assistant' })
  cpSync(FIXTURE, dir, { recursive: true })
  classroom = await startClassroomServer(dir)
  const lecture = join(dir, 'lecture.md')
  writeFileSync(lecture, readFileSync(lecture, 'utf8').replace('renderers:', `presmium:\n  presmium.session:\n    server: ${classroom.url}\nrenderers:`))
  log = `${dir}.agent.log`
  const command = `${process.execPath} ${AGENT}`
  dev = await startDev(dir, 'web', { PRESMIUM_AGENT_COMMAND: command, PRESMIUM_AGENT_TUTOR_COMMAND: command, PRESMIUM_AGENT_PROVIDER: 'Test Provider', SCRIPTED_AGENT_LOG: log })
})
test.afterAll(async () => {
  await dev?.stop()
  classroom?.child.kill('SIGTERM')
  if (dir) rmSync(dir, { recursive: true, force: true })
  if (log) rmSync(log, { force: true })
})

/** A page of the dev server (its address ends with a slash). */
const pageUrl = (path: string) => new URL(path, dev.url).href

/** What the test agent was asked last. */
function lastPrompt(): { question: string, context: Record<string, unknown> } {
  return readFileSync(log, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line) as { event: string, question: string, context: Record<string, unknown> }).filter(e => e.event === 'session/prompt').at(-1)!
}

/** The toolbar's question panel, opened. */
async function openPanel(page: Page) {
  await page.locator('.pm-assistant-toolbar').filter({ visible: true }).getByRole('button', { name: '提问' }).click()
  const panel = page.getByRole('dialog', { name: '向 AI 提问' })
  await expect(panel).toBeVisible()
  return panel
}

test('a reader asks about selected code: the provider shows before the question, the runtime after the answer, whose citation moves the page there', async ({ page }) => {
  await openDevPage(page, pageUrl('code.html'), page.locator('[data-section="merge"]'))
  // The reader selects the code of the section.
  await page.locator('[data-section="merge"] pre').first().evaluate((pre) => {
    const range = document.createRange()
    range.selectNodeContents(pre)
    document.getSelection()!.removeAllRanges()
    document.getSelection()!.addRange(range)
  })
  const panel = await openPanel(page)
  await expect(panel.locator('.pm-assistant__provider')).toHaveText('回答由 Test Provider 的模型生成')
  await expect(panel.locator('.pm-assistant__runtime')).toHaveCount(0)
  await expect(panel.locator('.pm-assistant__selection code')).toContainText('def merge(tokens, pair):')

  await panel.getByLabel('问题').fill('这段代码做什么？#cite later-section')
  await panel.getByRole('button', { name: '提问', exact: true }).click()
  const answers = panel.getByRole('list', { name: '回答' })
  const citation = answers.getByRole('button', { name: '进阶内容' })
  await expect(citation).toBeVisible({ timeout: 30_000 })
  await expect(answers.locator('.pm-assistant__answer')).toContainText('问题是「这段代码做什么？#cite later-section」')
  await expect(panel.locator('.pm-assistant__runtime')).toHaveText('运行时：Scripted Agent 1.0.0')
  // The agent got the selection, its section and its block.
  const asked = lastPrompt()
  expect(asked.context).toMatchObject({ section: 'merge' })
  expect(asked.context.selection).toContain('def merge(tokens, pair):')
  expect(asked.context.block).toBeTruthy()

  await citation.click()
  await expect(panel).toBeHidden()
  await expect(page).toHaveURL(/\/later\.html/)
  // The section itself (the classroom's note spot carries the section id too).
  await expect(page.locator('section.pm-section[data-section="later-section"]')).toBeInViewport()
})

test('in tutor mode the agent\'s attempt to write a file is refused, and the file stays', async ({ page }) => {
  const before = readFileSync(join(dir, 'lecture.md'), 'utf8')
  await openDevPage(page, pageUrl('code.html'), page.locator('[data-section="merge"]'))
  const panel = await openPanel(page)
  await panel.getByLabel('问题').fill('#write lecture.md')
  await panel.getByRole('button', { name: '提问', exact: true }).click()
  await expect(panel.getByRole('list', { name: '回答' }).locator('.pm-assistant__answer').first()).toHaveText('permission: rejected', { timeout: 30_000 })
  expect(readFileSync(join(dir, 'lecture.md'), 'utf8')).toBe(before)
})

test('a learner\'s question reaches the presenter\'s overview; the presenter sends the AI\'s answer, and the learner sees it', async ({ browser }) => {
  const contexts = await Promise.all([browser.newContext(), browser.newContext()])
  const [presenter, learner] = await Promise.all(contexts.map(context => context.newPage())) as [Page, Page]
  try {
    await openDevPage(presenter, pageUrl('code.html'), presenter.locator('[data-section="merge"]'))
    await presenter.getByRole('button', { name: /^课堂/ }).click()
    const session = presenter.getByRole('dialog', { name: '课堂' })
    await session.getByLabel('昵称').fill('王老师')
    await session.getByRole('button', { name: '创建课堂' }).click()
    const link = (await session.locator('.pm-session__link').getAttribute('href'))!
    await session.getByRole('button', { name: '关闭' }).click()

    await learner.goto(`${link}&name=${encodeURIComponent('小明')}`)
    const badge = learner.getByRole('region', { name: '课堂状态' })
    await expect(badge).toContainText('正在跟随主讲')
    await badge.getByRole('button', { name: '自主浏览' }).click()
    const box = learner.locator('.pm-question-box')
    await box.getByLabel('问题').fill('为什么先统计次数？')
    await box.getByRole('button', { name: '提问' }).click()
    await expect(box.getByRole('list', { name: '我的提问' })).toContainText('为什么先统计次数？')

    await presenter.getByRole('button', { name: /^互动/ }).click()
    const overview = presenter.getByRole('dialog', { name: '课堂互动' })
    const question = overview.getByRole('region', { name: '提问' }).getByRole('listitem').filter({ hasText: '为什么先统计次数？' })
    await question.getByRole('button', { name: 'AI 回答（Test Provider）' }).click()
    await expect(question.locator('.pm-classroom-panel__answer')).toContainText('问题是「为什么先统计次数？」', { timeout: 30_000 })
    await question.getByRole('button', { name: '发给课堂' }).click()
    await expect(question.locator('.pm-classroom-reply')).toContainText('AI 回答（Test Provider）：')

    // The learner gets the answer, its citation as plain text.
    const reply = box.getByRole('list', { name: '我的提问' }).locator('.pm-classroom-reply')
    await expect(reply).toContainText('AI 回答（Test Provider）：这段代码在课堂提问中讲解：问题是「为什么先统计次数？」。')
  } finally {
    await Promise.all(contexts.map(context => context.close()))
  }
})
