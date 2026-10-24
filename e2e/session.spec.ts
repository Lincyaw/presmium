import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { devices, expect, test } from '@playwright/test'
import type { Browser, Locator, Page } from '@playwright/test'
import { buildFixture, useFixture } from './fixtures/deck.ts'
import type { FixtureDeck } from './fixtures/deck.ts'
import { startClassroomServer } from './fixtures/plugins/decks.ts'

test.describe.configure({ mode: 'default' })
const HOST = { '@lincyaw/host': 'packages/host' }
const offline = useFixture('session', { with: ['host/plugin'], link: HOST })

const panelButton = (page: Page) => page.getByRole('button', { name: /^课堂/ })
const present = (page: Page) => page.getByRole('region', { name: '放映' })
const badge = (page: Page) => page.getByRole('region', { name: '课堂状态' })

function withServer(dir: string, server: string): void {
  const file = join(dir, 'lecture.md')
  const text = readFileSync(file, 'utf8')
    .replace('renderers:\n', `presmium:\n  presmium.session:\n    server: ${server}\nrenderers:\n`)
    .replace(`  - '@lincyaw/addon-session'\n`, `  - '@lincyaw/addon-session'\n  - ./core/deck/plugin\n`)
  writeFileSync(file, `${text}\n\`\`\`{include} remote.md\n\`\`\`\n`)
}

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

async function create(presenter: Page, name = '王老师'): Promise<{ panel: Locator, link: string, room: string }> {
  await panelButton(presenter).click()
  const panel = presenter.getByRole('dialog', { name: '课堂' })
  await panel.getByLabel('昵称').fill(name)
  await panel.getByRole('button', { name: '创建课堂' }).click()
  await expect(panel.getByRole('status')).toHaveText('课堂进行中，你是主讲')
  await expect(panel.getByRole('img', { name: '加入课堂的二维码' }).locator('svg')).toBeVisible()
  const link = (await panel.locator('.pm-session__link').getAttribute('href'))!
  return { panel, link, room: new URL(link).searchParams.get('room')! }
}

const overlayBar = (page: Page) => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--pm-overlay-bar').trim())

test.describe('a classroom', () => {
  test.describe.configure({ mode: 'serial', timeout: 90_000 })
  let classroom: Awaited<ReturnType<typeof startClassroomServer>>
  let archives: string
  let deck: FixtureDeck

  test.beforeAll(async () => {
    test.setTimeout(600_000)
    archives = mkdtempSync(join(tmpdir(), 'presmium-e2e-session-'))
    classroom = await startClassroomServer(archives)
    deck = await buildFixture('session', { with: ['core/deck/plugin', 'host/plugin'], link: HOST, edit: dir => withServer(dir, classroom.url) })
  })

  test.afterAll(async () => {
    await deck?.close()
    classroom?.child.kill('SIGTERM')
    if (archives) rmSync(archives, { recursive: true, force: true })
  })

  test('in the web form a learner follows the presenter, browses alone, comes back in one click, and sees the classroom end', async ({ browser }) => {
    const { presenter, learner, close } = await people(browser)

    await presenter.goto(`${deck.web}/session.html`)
    const { panel, link } = await create(presenter)
    await expect(panel.getByRole('status')).toHaveText('课堂进行中，你是主讲')
    expect(link).toMatch(/\/\?room=\w+$/)
    await expect(panel.getByRole('note')).toHaveText('学习者的设备打不开这个地址，请用局域网地址打开文稿')

    await learner.goto(`${link}&name=${encodeURIComponent('小明')}`)
    await expect(badge(learner)).toContainText('正在跟随主讲')
    await expect(learner).toHaveURL(/\/session\.html/)
    await expect(panel.getByRole('list', { name: '参与者' })).toContainText('小明')

    await panel.getByRole('button', { name: '关闭' }).click()
    await presenter.getByRole('combobox', { name: '视图' }).selectOption('present')
    await expect(present(presenter)).toHaveAttribute('data-section', 'session')
    for (let i = 0; i < 3; i++) await presenter.keyboard.press('ArrowRight')
    await expect(present(presenter)).toHaveAttribute('data-section', 'session-follow')
    await expect(present(presenter)).toHaveAttribute('data-step', '2')
    await expect(present(learner)).toHaveAttribute('data-section', 'session-follow')
    await expect(present(learner)).toHaveAttribute('data-step', '2')
    await expect(badge(learner)).toHaveCount(1)

    const bounds = await badge(learner).boundingBox()
    expect(bounds).not.toBeNull()
    const point = { x: bounds!.x + bounds!.width / 2, y: bounds!.y + bounds!.height / 2 }
    await presenter.keyboard.press('b')
    await expect(learner.locator('.pm-stage-black')).toBeVisible()
    await expect.poll(() => learner.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.classList.contains('pm-stage-black'), point)).toBe(true)
    await presenter.keyboard.press('b')
    await expect(learner.locator('.pm-stage-black')).toHaveCount(0)

    await badge(learner).getByRole('button', { name: '自主浏览' }).click()
    await presenter.keyboard.press('ArrowRight')
    await expect(badge(learner)).toContainText('主讲在第 3 节第 3 步')
    await expect(present(learner)).toHaveAttribute('data-step', '2')

    await badge(learner).getByRole('button', { name: '回到主讲进度' }).click()
    await expect(present(learner)).toHaveAttribute('data-step', '3')
    await expect(badge(learner)).toContainText('正在跟随主讲')
    await presenter.keyboard.press('ArrowRight')
    await expect(present(learner)).toHaveAttribute('data-section', 'web')

    await presenter.keyboard.press('Escape')
    await panelButton(presenter).click()
    await panel.getByRole('button', { name: '结束课堂' }).click()
    await expect(badge(learner)).toContainText('课堂已结束')
    await expect(panel.getByRole('status')).toHaveText('课堂已结束')
    await close()
  })

  test('a learner who opens the bare join link of the QR code gives a nickname and joins', async ({ browser }) => {
    const { presenter, learner, close } = await people(browser)
    await presenter.goto(`${deck.web}/session.html`)
    const { panel, link, room } = await create(presenter)

    await learner.goto(link)
    await expect(badge(learner)).toContainText(`加入课堂 ${room}`)
    await badge(learner).getByLabel('昵称').fill('小刚')
    await badge(learner).getByRole('button', { name: '加入课堂' }).click()
    await expect(badge(learner)).toContainText('正在跟随主讲')
    await expect(panel.getByRole('list', { name: '参与者' })).toContainText('小刚')
    await close()
  })

  test('the learner\'s badge leaves the present view\'s controls free, on a desktop and on a phone', async ({ browser }) => {
    const { presenter, learner, close } = await people(browser)
    const phone = await browser.newContext({ ...devices['iPhone 13'] })
    const mobile = await phone.newPage()
    await presenter.goto(`${deck.web}/session.html`)
    const { panel, link } = await create(presenter)
    await learner.goto(`${link}&name=${encodeURIComponent('小明')}`)
    await mobile.goto(`${link}&name=${encodeURIComponent('小刚')}`)
    for (const page of [learner, mobile]) await expect(badge(page)).toContainText('正在跟随主讲')
    await panel.getByRole('button', { name: '关闭' }).click()
    await presenter.getByRole('combobox', { name: '视图' }).selectOption('present')
    for (const page of [learner, mobile]) {
      await expect(present(page)).toBeVisible()
      await expect.poll(() => overlayBar(page)).toMatch(/^[1-9]\d*(\.\d+)?px$/)
    }

    const press = (page: Page, target: Locator) => (page === mobile ? target.tap() : target.click())
    for (const page of [learner, mobile]) {
      await press(page, present(page).getByRole('button', { name: '退出放映' }))
      await expect(present(page)).toHaveCount(0)
      expect(await overlayBar(page)).toBe('')
    }
    await presenter.keyboard.press('ArrowRight')
    for (const page of [learner, mobile]) {
      await expect(present(page)).toHaveAttribute('data-section', 'session-follow')
      await press(page, badge(page).getByRole('button', { name: '自主浏览' }))
      await press(page, present(page).getByRole('button', { name: '下一步' }))
      await expect(present(page)).toHaveAttribute('data-step', '1')
      await press(page, present(page).getByRole('button', { name: '总览' }))
      await expect(page.locator('.pm-overview')).toBeVisible()
    }
    await phone.close()
    await close()
  })

  test('a presenter whose window was closed rejoins from another window of the browser, then ends and archives the classroom', async ({ browser }) => {
    const context = await browser.newContext()
    const first = await context.newPage()
    await first.goto(`${deck.web}/session.html`)
    const { room } = await create(first)
    await first.close()

    const again = await context.newPage()
    await again.goto(`${deck.web}/session.html`)
    await panelButton(again).click()
    const panel = again.getByRole('dialog', { name: '课堂' })
    await expect(panel.getByRole('status')).toHaveText('未连接：尚未加入课堂')
    await panel.getByRole('button', { name: `以主讲身份回到课堂 ${room}` }).click()
    await expect(panel.getByRole('status')).toHaveText('课堂进行中，你是主讲')
    await panel.getByRole('button', { name: '结束课堂' }).click()
    await expect(panel.getByRole('status')).toHaveText('课堂已结束')
    await panel.getByRole('button', { name: '归档课堂' }).click()
    await expect(panel.getByRole('status')).toHaveText(`课堂已结束并归档到 .presmium/classroom/${room}.json`)
    await context.close()
  })

  test('a learner browsing alone still browses alone after a reload', async ({ browser }) => {
    const { presenter, learner, close } = await people(browser)
    await presenter.goto(`${deck.web}/session.html`)
    const { link } = await create(presenter)
    await learner.goto(`${link}&name=${encodeURIComponent('小明')}`)
    await badge(learner).getByRole('button', { name: '自主浏览' }).click()
    await expect(badge(learner)).toContainText('自主浏览中')
    await learner.reload()
    await expect(badge(learner)).toContainText('自主浏览中')
    await close()
  })

  test('the session panel\'s text wraps in its popover, which Esc closes', async ({ browser }) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    await page.goto(`${deck.web}/session.html`)
    const { panel } = await create(page, 'Presenter-with-a-rather-long-nickname-40')
    await expect(panel).toContainText('Presenter-with-a-rather-long-nickname-40')
    expect(await panel.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
    await page.keyboard.press('Escape')
    await expect(panel).toBeHidden()
    await context.close()
  })

  test('shared state of scope remote reaches the learners and a late joiner through the classroom, and in the web form the black screen too', async ({ browser }) => {
    const { presenter, learner, close } = await people(browser)
    await presenter.goto(`${deck.web}/remote.html`)
    const { panel, link } = await create(presenter)
    await panel.getByRole('button', { name: '关闭' }).click()
    await learner.goto(`${link}&name=${encodeURIComponent('小明')}`)
    await expect(learner.locator('.fx-remote__count')).toHaveText('0')
    for (let i = 0; i < 2; i++) await presenter.locator('.fx-remote button').click()
    await expect(learner.locator('.fx-remote__count')).toHaveText('2')

    const late = await (await browser.newContext()).newPage()
    await late.goto(`${link}&name=${encodeURIComponent('小刚')}`)
    await expect(late.locator('.fx-remote__count')).toHaveText('2')

    await presenter.getByRole('combobox', { name: '视图' }).selectOption('present')
    await expect(present(learner)).toBeVisible()
    await presenter.keyboard.press('b')
    await expect(learner.locator('.pm-stage-black')).toBeVisible()
    await presenter.keyboard.press('b')
    await expect(learner.locator('.pm-stage-black')).toHaveCount(0)
    await late.context().close()
    await close()
  })
})

test.describe('a classroom across the full and the student build', () => {
  test.describe.configure({ mode: 'serial', timeout: 90_000 })
  let classroom: Awaited<ReturnType<typeof startClassroomServer>>
  let archives: string
  let full: FixtureDeck
  let student: FixtureDeck

  test.beforeAll(async () => {
    test.setTimeout(600_000)
    archives = mkdtempSync(join(tmpdir(), 'presmium-e2e-session-audience-'))
    classroom = await startClassroomServer(archives)
    const server = (dir: string) => {
      const file = join(dir, 'lecture.md')
      writeFileSync(file, readFileSync(file, 'utf8').replace('renderers:\n', `presmium:\n  presmium.session:\n    server: ${classroom.url}\nrenderers:\n`))
    }
    ;[full, student] = await Promise.all([
      buildFixture('session/audience', { edit: server }),
      buildFixture('session/audience', { audience: 'student', edit: server }),
    ])
  })

  test.afterAll(async () => {
    await Promise.all([full?.close(), student?.close()])
    classroom?.child.kill('SIGTERM')
    if (archives) rmSync(archives, { recursive: true, force: true })
  })
})
