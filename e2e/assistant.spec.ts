// The assistant in the pages of `presmium dev` (WP-80, WP-92b; P-111, P-112, N-08), without any model the
// operator configured, for a deck git ignores (it is in examples/demo/.presmium):
// - "AI changes" is in the toolbar all the same; its popover says AI changes are unavailable, what to set (the
//   page's model settings, or the environment and a restart), what is missing in the page's language (the
//   server gives its code), and that the changes are committed to a git repository, which this deck is not in;
//   the model settings open from it. Each code of what is missing (the page's `info` answered with it) reads in
//   Chinese and in English.
// - Edit mode (P-124, WP-92d; `presmium dev --edit`): the deck's source opens in the browser; a paragraph picked in the preview opens
//   its line, a sentence added there and saved shows in the page without a reload; out of git, the status bar
//   says so and there is nothing to commit.
// - In a classroom, a learner's question reaches the presenter's overview; its "AI answer" asks the
//   presenter's own model service (the one the presenter filled in for the question panel; an
//   OpenAI-compatible service on this machine here), naming its provider; the presenter sends the answer to
//   the classroom, and the learner sees it, its citation as plain text.
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { chatStub, questionOf } from './fixtures/assistant/openai.ts'
import type { ChatStub } from './fixtures/assistant/openai.ts'
import { deckDir, openDevPage, startDev } from './fixtures/deck.ts'
import type { DevServer } from './fixtures/deck.ts'
import { startClassroomServer } from './fixtures/plugins/decks.ts'

const FIXTURE = fileURLToPath(new URL('./fixtures/assistant/lecture.md', import.meta.url))

test.describe.configure({ mode: 'serial', timeout: 180_000 })

let dir: string
let dev: DevServer
let classroom: Awaited<ReturnType<typeof startClassroomServer>>
let model: ChatStub

test.beforeAll(async () => {
  test.setTimeout(300_000)
  dir = deckDir('assistant', { '@presmium/slidev-addon-assistant': 'packages/addon-assistant' })
  cpSync(FIXTURE, join(dir, 'lecture.md'))
  classroom = await startClassroomServer(dir)
  const lecture = join(dir, 'lecture.md')
  writeFileSync(lecture, readFileSync(lecture, 'utf8').replace('renderers:', `presmium:\n  presmium.session:\n    server: ${classroom.url}\nrenderers:`))
  model = await chatStub(request => ['这段代码在', `[合并规则](presmium://sections/merge)中讲解：问题是「${questionOf(request)}」。`])
  // No model of the operator's: no model variable, and a configuration directory of its own.
  // Edit mode is `--edit`'s (until WP-96g).
  dev = await startDev(dir, 'web', { XDG_CONFIG_HOME: `${dir}.config`, DEEPSEEK_API_KEY: '', PRESMIUM_MODEL_URL: '', PRESMIUM_AGENT_COMMAND: '' }, ['--edit'])
})
test.afterAll(async () => {
  await dev?.stop()
  await model?.close()
  classroom?.child.kill('SIGTERM')
  for (const path of [dir, `${dir}.config`]) if (path) rmSync(path, { recursive: true, force: true })
})

/** A page of the dev server (its address ends with a slash). */
const pageUrl = (path: string) => new URL(path, dev.url).href

test('"AI changes" is in the toolbar without a model: it says what to set, that changes are committed to git, and opens the model settings', async ({ page }) => {
  await openDevPage(page, pageUrl('code.html'), page.locator('[data-section="merge"]'))
  await page.locator('.pm-assistant-edit-toolbar').filter({ visible: true }).getByRole('button', { name: 'AI 修改' }).click()
  const panel = page.getByRole('dialog', { name: 'AI 修改' })
  await expect(panel).toContainText('AI 修改不可用：没有配置模型。')
  await expect(panel).toContainText('在“模型设置”中填写模型服务')
  await expect(panel).toContainText('DEEPSEEK_API_KEY')
  await expect(panel).toContainText('缺少：模型服务（在“模型设置”中填写，或设置环境变量 DEEPSEEK_API_KEY')
  await expect(panel).not.toContainText('no model access')
  await expect(panel).toContainText('AI 修改要提交到 git：这份文稿不在 git 仓库中（或被 git 忽略）')
  await panel.getByRole('button', { name: '模型设置' }).click()
  const settings = page.getByRole('dialog', { name: '模型设置' })
  await expect(settings).toContainText('当前生效：没有配置')
  await expect(settings).toContainText('密钥（未设置）')
  await expect(settings).toContainText(`${dir}.config/presmium/assistant.json`)
})

test('what is missing reads by its code, in the page\'s language: the variables a partial model service lacks, a replacement runtime\'s provider, the bundled harness', async ({ page }) => {
  // The server gives each code where its environment has it (packages/addon-assistant/test/acp.test.ts); here its
  // `info` answers with each in turn, the rest as the server has it, and the page says it in Chinese, then English.
  const cases: [Record<string, unknown>, string, string][] = [
    [{ code: 'model', variables: ['PRESMIUM_MODEL_KEY', 'PRESMIUM_MODEL_PROVIDER'] }, '模型服务：PRESMIUM_MODEL_URL、PRESMIUM_MODEL_KEY 与 PRESMIUM_MODEL_PROVIDER 要一起设置，还缺 PRESMIUM_MODEL_KEY、PRESMIUM_MODEL_PROVIDER', 'a model service: PRESMIUM_MODEL_URL, PRESMIUM_MODEL_KEY and PRESMIUM_MODEL_PROVIDER go together, and PRESMIUM_MODEL_KEY and PRESMIUM_MODEL_PROVIDER are not set'],
    [{ code: 'provider' }, '替换运行时的服务提供方：PRESMIUM_AGENT_COMMAND（或工作区配置中的 command）要配上 PRESMIUM_AGENT_PROVIDER（或 provider）', 'the replacement runtime\'s provider: PRESMIUM_AGENT_COMMAND (or the workspace configuration\'s command) needs PRESMIUM_AGENT_PROVIDER (or provider)'],
    [{ code: 'harness' }, '随包的 DeepSeek Harness（没有安装）', 'the bundled DeepSeek Harness (not installed)'],
    [{ code: 'model' }, '模型服务（在“模型设置”中填写', 'a model service (fill in “Model settings”, or set DEEPSEEK_API_KEY'],
  ]
  let missing: Record<string, unknown> = {}
  await page.route(/\/__presmium\/presmium\.assistant\/info(?:\?|$)/, async (route) => {
    const response = await route.fetch()
    await route.fulfill({ response, json: { ...await response.json() as object, missing } })
  })
  const button = page.locator('.pm-assistant-edit-toolbar').filter({ visible: true }).getByRole('button')
  for (const [index, [item, zh, en]] of cases.entries()) {
    missing = item
    if (index === 0) await openDevPage(page, pageUrl('code.html'), button)
    else await page.reload()
    await button.click()
    await expect(page.getByRole('dialog', { name: 'AI 修改' })).toContainText(`缺少：${zh}`)
    // The UI language follows `<html lang>`.
    await page.evaluate(() => document.documentElement.lang = 'en')
    await expect(page.getByRole('dialog', { name: 'AI changes' })).toContainText(`Missing: ${en}`)
  }
})

test('edit mode: the deck\'s source opens in the browser, a sentence saved shows in the page without a reload; out of git, nothing is committed', async ({ page }) => {
  const toggle = page.locator('.pm-workspace-edit').filter({ visible: true })
  const editor = page.getByRole('region', { name: '源码' }).getByRole('textbox', { name: '源码' })
  // Edit mode loads modules of its own: the first time, the dev server may optimize a dependency it finds then and
  // reload the page; so it is entered once and its requests waited for, then the page is visited again.
  for (let visit = 0; visit < 2; visit++) {
    await openDevPage(page, pageUrl('code.html'), toggle)
    await toggle.click()
    await expect(editor).toContainText('每一轮合并出现次数最多的一对。', { timeout: 30_000 })
    await page.waitForLoadState('networkidle')
  }
  await page.evaluate(() => (window as unknown as { unreloaded: boolean }).unreloaded = true)

  // The paragraph picked in the preview: its line, the cursor on it; a sentence added at its end and saved.
  await page.locator('.pm-section[data-section] .pm-block--markdown').filter({ hasText: '每一轮合并出现次数最多的一对。' }).click()
  const line = readFileSync(join(dir, 'lecture.md'), 'utf8').split('\n').findIndex(text => text.startsWith('每一轮合并')) + 1
  const status = page.getByRole('contentinfo', { name: '状态栏' })
  await expect(status.locator('.pm-workspace-cursor')).toHaveText(`MyST · UTF-8 · 第 ${line} 行`)
  await editor.focus()
  await page.keyboard.press('End')
  await page.keyboard.type('开发中加的一句。')
  await page.keyboard.press('Control+s')
  await expect(page.locator('.pm-section[data-section] .pm-block--markdown').filter({ hasText: '最多的一对。开发中加的一句。' })).toBeVisible()
  expect(readFileSync(join(dir, 'lecture.md'), 'utf8')).toContain('每一轮合并出现次数最多的一对。开发中加的一句。\n')
  expect(await page.evaluate(() => (window as unknown as { unreloaded?: boolean }).unreloaded === true)).toBe(true)

  // Not in a git repository: the status bar says so, and there is nothing to commit.
  await expect(status.locator('.pm-workspace-git')).toHaveText('不是 git 仓库')
  await expect(page.getByRole('button', { name: /^提交 \d+ 处修改/ })).toHaveCount(0)
})

test('a learner\'s question reaches the presenter\'s overview; the presenter\'s own model service answers it, the presenter sends it, and the learner sees it', async ({ browser }) => {
  const contexts = await Promise.all([browser.newContext(), browser.newContext()])
  const [presenter, learner] = await Promise.all(contexts.map(context => context.newPage())) as [Page, Page]
  try {
    await openDevPage(presenter, pageUrl('code.html'), presenter.locator('[data-section="merge"]'))
    // The presenter's own model service, filled in once in the question panel.
    await presenter.locator('.pm-assistant-toolbar').filter({ visible: true }).getByRole('button', { name: '提问' }).click()
    const ask = presenter.getByRole('dialog', { name: '向 AI 提问' })
    await ask.getByLabel('地址').fill(model.url)
    await ask.getByLabel('密钥').fill('presenter-key-51c')
    await ask.getByLabel('模型名').fill('stub-model')
    await ask.getByRole('button', { name: '保存' }).click()
    await ask.getByRole('button', { name: '关闭' }).click()

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

    const provider = new URL(model.url).host
    await presenter.getByRole('button', { name: /^互动/ }).click()
    const overview = presenter.getByRole('dialog', { name: '课堂互动' })
    const question = overview.getByRole('region', { name: '提问' }).getByRole('listitem').filter({ hasText: '为什么先统计次数？' })
    await question.getByRole('button', { name: `AI 回答（${provider}）` }).click()
    await expect(question.locator('.pm-classroom-panel__answer')).toContainText('问题是「为什么先统计次数？」', { timeout: 30_000 })
    await question.getByRole('button', { name: '发给课堂' }).click()
    await expect(question.locator('.pm-classroom-reply')).toContainText(`AI 回答（${provider}）：`)
    // The presenter's browser asked the presenter's service, with the question's section.
    const asked = model.received.find(r => r.method === 'POST')!
    expect(asked.headers.authorization).toBe('Bearer presenter-key-51c')
    expect(asked.body.messages![0]!.content).toContain('(id questions')

    // The learner gets the answer, its citation as plain text.
    const reply = box.getByRole('list', { name: '我的提问' }).locator('.pm-classroom-reply')
    await expect(reply).toContainText(`AI 回答（${provider}）：这段代码在合并规则中讲解：问题是「为什么先统计次数？」。`)
  } finally {
    await Promise.all(contexts.map(context => context.close()))
  }
})
