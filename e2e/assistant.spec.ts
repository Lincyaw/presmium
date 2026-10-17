// The assistant in the pages of `presmium dev` (WP-80, WP-92b; P-111, P-112, N-08), without any model the
// operator configured:
// - "AI changes" is in the toolbar all the same; its panel says AI changes are unavailable, what to set (the
//   page's model settings, or the environment and a restart), and that they are made in the workspace
//   service; the model settings open from it.
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
  dev = await startDev(dir, 'web', { XDG_CONFIG_HOME: `${dir}.config`, DEEPSEEK_API_KEY: '', PRESMIUM_MODEL_URL: '', PRESMIUM_AGENT_COMMAND: '' })
})
test.afterAll(async () => {
  await dev?.stop()
  await model?.close()
  classroom?.child.kill('SIGTERM')
  for (const path of [dir, `${dir}.config`]) if (path) rmSync(path, { recursive: true, force: true })
})

/** A page of the dev server (its address ends with a slash). */
const pageUrl = (path: string) => new URL(path, dev.url).href

test('"AI changes" is in the toolbar without a model: it says what to set, that changes are made in the workspace service, and opens the model settings', async ({ page }) => {
  await openDevPage(page, pageUrl('code.html'), page.locator('[data-section="merge"]'))
  await page.locator('.pm-assistant-edit-toolbar').filter({ visible: true }).getByRole('button', { name: 'AI 修改' }).click()
  const panel = page.getByRole('complementary', { name: 'AI 修改' })
  await expect(panel).toContainText('AI 修改不可用：没有配置模型。')
  await expect(panel).toContainText('在“模型设置”中填写模型服务')
  await expect(panel).toContainText('DEEPSEEK_API_KEY')
  await expect(panel).toContainText('缺少：no model access')
  await expect(panel).toContainText('AI 修改在工作区服务（presmium serve）中使用')
  await panel.getByRole('button', { name: '模型设置' }).click()
  const settings = page.getByRole('dialog', { name: '模型设置' })
  await expect(settings).toContainText('当前生效：没有配置')
  await expect(settings).toContainText('密钥（未设置）')
  await expect(settings).toContainText(`${dir}.config/presmium/assistant.json`)
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
