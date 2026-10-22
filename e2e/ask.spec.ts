import { request as httpRequest, createServer } from 'node:http'
import type { IncomingHttpHeaders } from 'node:http'
import type { AddressInfo } from 'node:net'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { chatStub, questionOf } from './fixtures/assistant/openai.ts'
import type { ChatStub } from './fixtures/assistant/openai.ts'
import { buildFixture } from './fixtures/deck.ts'
import type { FixtureDeck } from './fixtures/deck.ts'

test.describe.configure({ mode: 'serial', timeout: 120_000 })

const KEY = 'reader-key-3d9a'

interface Site {
  url: string
  requests: { method: string, url: string, headers: IncomingHttpHeaders }[]
  close(): Promise<void>
}

async function recordingSite(origin: string): Promise<Site> {
  const requests: Site['requests'] = []
  const server = createServer((req, res) => {
    requests.push({ method: req.method ?? '', url: req.url ?? '', headers: req.headers })
    const forward = httpRequest(new URL(req.url ?? '/', origin), { method: req.method, headers: req.headers }, (answer) => {
      res.writeHead(answer.statusCode ?? 502, answer.headers)
      answer.pipe(res)
    })
    forward.on('error', () => res.writeHead(502).end())
    req.pipe(forward)
  })
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    requests,
    close: () => new Promise((done) => {
      server.close(() => done())
      server.closeAllConnections()
    }),
  }
}

let deck: FixtureDeck
let site: Site
let model: ChatStub

test.beforeAll(async () => {
  test.setTimeout(600_000)
  deck = await buildFixture('assistant/ask', { to: 'web', audience: 'student', link: { '@lincyaw/slidev-addon-assistant': 'packages/addon-assistant' } })
  site = await recordingSite(deck.web)
  model = await chatStub(request => ['这段代码', `回答「${questionOf(request)}」：把出现最多的一对合并成一个词元，`, '见[进阶内容](presmium://sections/later-section)。'])
})
test.afterAll(async () => {
  await site?.close()
  await model?.close()
  await deck?.close()
})

function errorsOf(page: Page): string[] {
  const errors: string[] = []
  page.on('console', message => message.type() === 'error' && errors.push(message.text()))
  page.on('pageerror', error => errors.push(error.message))
  return errors
}

async function openPanel(page: Page) {
  await page.locator('.pm-assistant-toolbar').filter({ visible: true }).getByRole('button', { name: '提问' }).click()
  const panel = page.getByRole('dialog', { name: '向 AI 提问' })
  await expect(panel).toBeVisible()
  return panel
}

test('without a model service the panel says how questions are answered and where the settings stay, and asks for one', async ({ page }) => {
  const errors = errorsOf(page)
  await page.goto(`${site.url}/code.html`)
  await expect(page.locator('[data-section="merge"]').first()).toBeVisible()
  const panel = await openPanel(page)
  const settings = panel.getByRole('form', { name: '你的模型服务' })
  await expect(settings).toContainText('OpenAI 兼容的 Chat Completions 接口')
  await expect(settings).toContainText('不经过本站')
  await expect(settings.getByRole('note')).toContainText('同一站点上的脚本能读到密钥')
  await expect(settings.getByLabel('地址')).toBeVisible()
  await expect(panel.getByLabel('问题')).toHaveCount(0)
  expect(model.received).toEqual([])
  expect(errors).toEqual([])
})

test('the reader fills in his service and asks about selected code: the answer streams in, its citation moves the page; the service gets the key and what the page shows, the site nothing', async ({ page }) => {
  const errors = errorsOf(page)
  await page.goto(`${site.url}/code.html`)
  await expect(page.locator('[data-section="merge"]').first()).toBeVisible()
  let panel = await openPanel(page)
  const settings = panel.getByRole('form', { name: '你的模型服务' })
  await settings.getByLabel('地址').fill(model.url)
  await settings.getByLabel('密钥').fill(KEY)
  await settings.getByLabel('模型名').fill('stub-model')
  await settings.getByRole('button', { name: '保存' }).click()
  await expect(panel.locator('.pm-assistant__provider')).toContainText(`回答由 ${new URL(model.url).host} 的模型 stub-model 生成`)
  await panel.getByRole('button', { name: '关闭' }).click()

  await page.locator('[data-section="merge"] pre').first().evaluate((pre) => {
    const range = document.createRange()
    range.selectNodeContents(pre)
    document.getSelection()!.removeAllRanges()
    document.getSelection()!.addRange(range)
  })
  panel = await openPanel(page)
  await expect(panel.locator('.pm-assistant__selection code')).toContainText('def merge(tokens, pair):')
  model.hold()
  await panel.getByLabel('问题').fill('这段代码做什么？')
  await panel.getByRole('button', { name: '提问', exact: true }).click()
  const answers = panel.getByRole('list', { name: '回答' })
  await expect(answers.locator('.pm-assistant__answer')).toHaveText('这段代码')
  await expect(answers.getByRole('status')).toContainText('回答中')
  model.release()
  const citation = answers.getByRole('button', { name: '进阶内容' })
  await expect(citation).toBeVisible()
  await expect(answers.locator('.pm-assistant__answer')).toContainText('回答「这段代码做什么？」：把出现最多的一对合并成一个词元，见进阶内容。')

  const asked = model.received.find(r => r.method === 'POST')!
  expect(asked.headers.authorization).toBe(`Bearer ${KEY}`)
  expect(asked.body).toMatchObject({ model: 'stub-model', stream: true })
  const sent = JSON.stringify(asked.body.messages)
  const system = asked.body.messages![0]!.content
  expect(system).toContain('def merge(tokens, pair):')
  expect(system).toContain('The section the reader is at: 合并规则 (id merge')
  expect(system).toContain('每一轮合并出现次数最多的一对。')
  expect(system).toContain('- later-section: 进阶内容')
  expect(sent).not.toContain('TEACHER-HINT-42')
  expect(sent).not.toContain('TEACHER-SECTION-77')
  expect(sent).not.toContain('教学安排')

  await citation.click()
  await expect(panel).toBeHidden()
  await expect(page).toHaveURL(/\/later\.html/)
  await expect(page.locator('section.pm-section[data-section="later-section"]')).toBeInViewport()

  expect(site.requests.length).toBeGreaterThan(0)
  expect(JSON.stringify(site.requests)).not.toContain(KEY)
  expect(errors).toEqual([])
})

test('the static output has no console error, in the reading and the presenter view, and the assistant started', async ({ page }) => {
  const errors = errorsOf(page)
  await page.goto(`${site.url}/?view=presenter&section=merge`)
  await expect(page.locator('[data-section="merge"]').first()).toBeVisible()
  await page.locator('.pm-presenter-panels summary').click()
  await expect(page.locator('.pm-start-report [data-plugin="presmium.assistant"]')).toHaveAttribute('data-status', 'started')
  await page.goto(`${site.url}/`)
  await expect(page.locator('[data-section]').first()).toBeVisible()
  await expect(page.locator('.pm-assistant-toolbar').filter({ visible: true }).getByRole('button', { name: '提问' })).toBeVisible()
  expect(errors).toEqual([])
})

test('in the slides form, which has no IR runtime, a question goes with the current slide\'s text; a citation goes to its section\'s slide', async ({ page }) => {
  test.setTimeout(600_000)
  const slides = await buildFixture('assistant/ask', { to: 'slides', audience: 'student', link: { '@lincyaw/slidev-addon-assistant': 'packages/addon-assistant' } })
  try {
    await page.goto(`${slides.slides}/${slides.slide('merge')}`)
    await expect(page.locator('.slidev-page').getByRole('heading', { name: '合并规则' })).toBeVisible()
    await page.mouse.move(20, 700)
    const panel = await openPanel(page)
    await panel.getByLabel('地址').fill(model.url)
    await panel.getByLabel('密钥').fill(KEY)
    await panel.getByLabel('模型名').fill('stub-model')
    await panel.getByRole('button', { name: '保存' }).click()
    const before = model.received.length
    await panel.getByLabel('问题').fill('这一页讲什么？')
    await panel.getByRole('button', { name: '提问', exact: true }).click()
    const citation = panel.getByRole('list', { name: '回答' }).getByRole('button', { name: '进阶内容' })
    await expect(citation).toBeVisible()
    const system = model.received.slice(before).find(r => r.method === 'POST')!.body.messages![0]!.content
    expect(system).toContain('def merge(tokens, pair):')
    expect(system).toContain('(id merge')
    expect(system).not.toContain('later-section:')
    expect(system).not.toContain('TEACHER-HINT-42')
    await citation.click()
    await expect(page.locator('.slidev-page').getByRole('heading', { name: '进阶内容' })).toBeVisible()
  } finally {
    await slides.close()
  }
})
