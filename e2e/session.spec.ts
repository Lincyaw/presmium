import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { devices, expect, test } from '@playwright/test'
import type { Browser, Locator, Page } from '@playwright/test'
import { buildFixture, useFixture } from './fixtures/deck.ts'
import type { FixtureDeck } from './fixtures/deck.ts'
import { startClassroomServer } from './fixtures/plugins/decks.ts'

test.describe.configure({ mode: 'default' })
const offline = useFixture('session')

const panelButton = (page: Page) => page.getByRole('button', { name: /^课堂/ })
const present = (page: Page) => page.getByRole('region', { name: '放映' })
const badge = (page: Page) => page.getByRole('region', { name: '课堂状态' })

test('without a classroom server the deck shows and reads as before, and its build shows no classroom', async ({ page }) => {
  await page.goto(`${offline().web}/session.html`)
  await expect(page.locator('.pm-section[data-section="session-follow"]')).toContainText('回到主讲进度')
  await expect(page.locator('.VPNav')).toBeVisible()
  await expect(panelButton(page)).toHaveCount(0)
  await expect(badge(page)).toHaveCount(0)

  await page.goto(`${offline().web}/session.html?view=present&section=session-follow`)
  await expect(present(page)).toHaveAttribute('data-section', 'session-follow')
  await page.keyboard.press('ArrowRight')
  await expect(present(page)).toHaveAttribute('data-step', '1')

  const sessionPlugins = async () => {
    await page.locator('.pm-presenter-panels summary').click()
    const plugins = page.locator('.pm-start-report [data-plugin^="presmium.session"]')
    await expect(plugins).toHaveCount(1)
    await expect(plugins).toHaveAttribute('data-plugin', 'presmium.session')
    await expect(plugins).toHaveAttribute('data-status', 'started')
  }
  await page.goto(`${offline().web}/session.html?view=presenter&section=session`)
  await sessionPlugins()
  await expect.poll(() => overlayBar(page)).toMatch(/^[1-9]\d*(\.\d+)?px$/)

  await page.goto(`${offline().slides}/presenter/session`)
  await sessionPlugins()
  await expect(page.locator('[data-panel="presmium.session"]')).toHaveCount(0)
  await page.goto(`${offline().slides}/session`)
  await expect(page.locator('.slidev-page').getByRole('heading', { name: '课堂会话' })).toBeVisible()
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('.slidev-page').getByRole('heading', { name: '跟随与自主' })).toBeVisible()
})

function withServer(dir: string, server: string): void {
  const file = join(dir, 'lecture.md')
  const text = readFileSync(file, 'utf8')
    .replace('presmium:\n', `presmium:\n  presmium.session:\n    server: ${server}\n`)
    .replace(`  - '@lincyaw/slidev-addon-session'\n`, `  - '@lincyaw/slidev-addon-session'\n  - ./core/deck/plugin\n`)
  writeFileSync(file, `${text}\n\`\`\`{include} remote.md\n\`\`\`\n`)
  mkdirSync(join(dir, 'node_modules/@lincyaw'), { recursive: true })
  symlinkSync(resolve('packages/host'), join(dir, 'node_modules/@lincyaw/host'), 'junction')
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
    deck = await buildFixture('session', { with: ['core/deck/plugin'], edit: dir => withServer(dir, classroom.url) })
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

  test('in the slides form a learner follows the presenter from slide to slide and click to click, with Slidev\'s state, over one connection', async ({ browser }) => {
    const { presenter, learner, close } = await people(browser)
    const sockets: string[] = []
    learner.on('websocket', socket => void sockets.push(socket.url()))

    await presenter.goto(`${deck.slides}/presenter/2`)
    await presenter.locator('.pm-presenter-panels summary').click()
    const panel = presenter.locator('[data-panel="presmium.session"]')
    await panel.getByLabel('昵称').fill('王老师')
    await panel.getByRole('button', { name: '创建课堂' }).click()
    await expect(panel.getByRole('img', { name: '加入课堂的二维码' }).locator('svg')).toBeVisible()
    const link = await panel.locator('.pm-session__link').getAttribute('href')

    await learner.goto(`${link}&name=${encodeURIComponent('小红')}`)
    await expect(badge(learner)).toContainText('正在跟随主讲')
    await expect(learner).toHaveURL(/\/session(\?|$)/)
    await expect(panel.getByRole('list', { name: '参与者' })).toContainText('小红')

    await presenter.keyboard.press('ArrowRight')
    await expect(learner).toHaveURL(/\/3(\?|$)/)
    await presenter.keyboard.press('ArrowRight')
    await expect(learner).toHaveURL(/\/3\?(.*&)?clicks=1(&|$)/)

    await presenter.keyboard.press('b')
    await expect(learner.locator('.pm-stage-black')).toBeVisible()
    await presenter.keyboard.press('b')
    await expect(learner.locator('.pm-stage-black')).toHaveCount(0)
    expect(sockets.filter(url => url.startsWith(classroom.url))).toHaveLength(1)
    await close()
  })

  test('the learner\'s badge leaves the present view\'s controls free, on a desktop and on a phone (P-62)', async ({ browser }) => {
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

  test('a presenter whose window was closed rejoins from another window of the browser, then ends and archives the classroom (P-60)', async ({ browser }) => {
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

  test('a learner browsing alone still browses alone after a reload (P-62)', async ({ browser }) => {
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

  test('shared state of scope remote reaches the learners and a late joiner through the classroom, and in the web form the black screen too (P-61)', async ({ browser }) => {
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

test.describe('a classroom across the full and the student build (D-4)', () => {
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

  test('a learner of the student build follows the presenter of the full build to the same section, and the overview numbers the learner\'s places as the presenter\'s build does (F-85)', async ({ browser }) => {
    expect([full.slide('follow-rules'), student.slide('follow-rules')]).toEqual([3, 2])
    const { presenter, learner, close } = await people(browser)
    await presenter.goto(`${full.web}/`)
    const { panel, room } = await create(presenter)
    await learner.goto(`${student.web}/?room=${room}&name=${encodeURIComponent('小明')}`)
    await expect(badge(learner)).toContainText('正在跟随主讲')

    await panel.getByRole('button', { name: '关闭' }).click()
    await presenter.getByRole('combobox', { name: '视图' }).selectOption('present')
    await expect(present(learner)).toHaveAttribute('data-section', 'follow-cover')
    await presenter.keyboard.press('ArrowRight')
    await expect(present(presenter)).toHaveAttribute('data-section', 'follow-plan')
    await presenter.keyboard.press('ArrowRight')
    await expect(present(presenter)).toHaveAttribute('data-section', 'follow-rules')
    await expect(present(learner)).toHaveAttribute('data-section', 'follow-rules')
    await expect(badge(learner)).toContainText('正在跟随主讲')

    const point = (page: Page, text: string) => present(page).getByText(text)
    await presenter.keyboard.press('ArrowRight')
    await expect(present(presenter)).toHaveAttribute('data-step', '1')
    await expect(point(presenter, '教师提示')).toBeVisible()
    await learner.waitForTimeout(1000)
    await expect(present(learner)).toHaveAttribute('data-step', '0')
    for (const step of [1, 2]) {
      await presenter.keyboard.press('ArrowRight')
      await expect(present(presenter)).toHaveAttribute('data-step', String(step + 1))
      await expect(present(learner)).toHaveAttribute('data-step', String(step))
      await expect(point(learner, '第一步')).toBeVisible()
      await expect(point(learner, '第二步')).toBeVisible({ visible: step === 2 })
    }
    await presenter.keyboard.press('ArrowRight')
    await expect(present(learner)).toHaveAttribute('data-section', 'follow-ask')

    for (let i = 0; i < 5; i++) await presenter.keyboard.press('ArrowLeft')
    await expect(present(presenter)).toHaveAttribute('data-section', 'follow-plan')
    await expect(present(learner)).toHaveAttribute('data-section', 'follow-cover')
    for (let i = 0; i < 5; i++) await presenter.keyboard.press('ArrowRight')
    await expect(present(learner)).toHaveAttribute('data-section', 'follow-ask')
    await presenter.keyboard.press('ArrowRight')
    await expect(present(presenter)).toHaveAttribute('data-section', 'follow-answers')
    await learner.waitForTimeout(1000)
    await expect(present(learner)).toHaveAttribute('data-section', 'follow-ask')
    await presenter.keyboard.press('ArrowLeft')
    await expect(present(presenter)).toHaveAttribute('data-section', 'follow-ask')

    await badge(learner).getByRole('button', { name: '自主浏览' }).click()
    await present(learner).getByRole('button', { name: '退出放映' }).click()
    const box = learner.locator('.pm-question-box')
    await box.getByLabel('问题').fill('平手时先合并哪一对？')
    await box.getByRole('button', { name: '提问' }).click()
    await expect(box.getByRole('list', { name: '我的提问' })).toContainText('平手时先合并哪一对？')
    await presenter.keyboard.press('Escape')
    await presenter.getByRole('button', { name: /^互动/ }).click()
    const overview = presenter.getByRole('dialog', { name: '课堂互动' })
    expect([full.slide('follow-ask'), student.slide('follow-ask')]).toEqual([4, 3])
    await expect(overview.getByRole('region', { name: '提问' }).locator('.pm-classroom-panel__where')).toHaveText('第 4 节 · 提问')
    await close()
  })

  test('in the slides form too, a learner of the student build follows the presenter of the full build to the same slide by its section, and sees the presenter\'s drawings there (F-85)', async ({ browser }) => {
    const { presenter, learner, close } = await people(browser)
    const slide = (page: Page, heading: string) => page.locator('.slidev-page').getByRole('heading', { name: heading })
    await presenter.goto(`${full.slides}/presenter/1`)
    await presenter.locator('.pm-presenter-panels summary').click()
    const panel = presenter.locator('[data-panel="presmium.session"]')
    await panel.getByLabel('昵称').fill('王老师')
    await panel.getByRole('button', { name: '创建课堂' }).click()
    const link = (await panel.locator('.pm-session__link').getAttribute('href'))!
    await learner.goto(`${student.slides}/?room=${new URL(link).searchParams.get('room')}&name=${encodeURIComponent('小明')}`)
    await expect(badge(learner)).toContainText('正在跟随主讲')
    await expect(slide(learner, '跟随与受众')).toBeVisible()

    await presenter.keyboard.press('ArrowRight')
    await expect(presenter).toHaveURL(/\/presenter\/2(\?|$)/)
    await learner.waitForTimeout(1500)
    await expect(learner).toHaveURL(/\/1(\?|$)/)
    await presenter.keyboard.press('ArrowRight')
    await expect(learner).toHaveURL(/\/2(\?|$)/)
    await expect(slide(learner, '合并规则')).toBeVisible()
    await presenter.getByTitle('Show drawing toolbar').click()
    const box = (await presenter.locator('.slidev-slide-content').first().boundingBox())!
    await presenter.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.7)
    await presenter.mouse.down()
    for (let i = 1; i <= 10; i++) await presenter.mouse.move(box.x + box.width * (0.3 + i * 0.03), box.y + box.height * 0.7 - i * 4)
    await presenter.mouse.up()
    const strokes = learner.locator('.slidev-slide-content > svg path')
    await expect(strokes).not.toHaveCount(0)
    const clicks = (n: number) => new RegExp(`/2\\?(.*&)?clicks=${n}(&|$)`)
    await presenter.keyboard.press('ArrowRight')
    await expect(presenter).toHaveURL(/\/presenter\/3\?(.*&)?clicks=1(&|$)/)
    await learner.waitForTimeout(1000)
    await expect(learner).not.toHaveURL(/clicks=[1-9]/)
    for (const n of [1, 2]) {
      await presenter.keyboard.press('ArrowRight')
      await expect(presenter).toHaveURL(new RegExp(`/presenter/3\\?(.*&)?clicks=${n + 1}(&|$)`))
      await expect(learner).toHaveURL(clicks(n))
    }
    await presenter.keyboard.press('ArrowRight')
    await expect(learner).toHaveURL(/\/3(\?|$)/)
    await expect(slide(learner, '提问')).toBeVisible()
    await expect(strokes).toHaveCount(0)
    await expect(badge(learner)).toContainText('正在跟随主讲')
    await presenter.keyboard.press('ArrowRight')
    await expect(presenter).toHaveURL(/\/presenter\/5(\?|$)/)
    await learner.waitForTimeout(1500)
    await expect(learner).toHaveURL(/\/3(\?|$)/)
    for (let i = 0; i < 3; i++) await presenter.keyboard.press('ArrowUp')
    await expect(presenter).toHaveURL(/\/presenter\/2(\?|$)/)
    await expect(learner).toHaveURL(/\/1(\?|$)/)
    await close()
  })
})
