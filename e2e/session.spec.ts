import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import type { Browser, Page } from '@playwright/test'
import { buildFixture, useFixture } from './fixtures/deck.ts'
import type { FixtureDeck } from './fixtures/deck.ts'
import { startClassroomServer } from './fixtures/plugins/decks.ts'

// Classroom sessions (e2e/fixtures/session). The fixture deck configures no classroom server; the
// classroom tests build a copy whose frontmatter points to a real classroom server
// (`presmium-classroom-server` on a free port) and drive a presenter and a learner in separate
// browser contexts.
test.describe.configure({ mode: 'default' })
const offline = useFixture('session')

const panelButton = (page: Page) => page.getByRole('button', { name: /^课堂/ })
const present = (page: Page) => page.getByRole('region', { name: '放映' })
const badge = (page: Page) => page.getByRole('region', { name: '课堂状态' })

test('without a classroom server the deck shows and reads as before, and the session says it is not connected', async ({ page }) => {
  await page.goto(`${offline().web}/session.html`)
  await expect(page.locator('.pm-section[data-section="session-follow"]')).toContainText('回到主讲进度')
  await expect(panelButton(page)).toContainText('未连接')
  await panelButton(page).click()
  await expect(page.getByRole('dialog', { name: '课堂' }).getByRole('status')).toHaveText(/^未连接/)
  await expect(badge(page)).toHaveCount(0)

  await page.goto(`${offline().web}/session.html?view=present&section=session-follow`)
  await expect(present(page)).toHaveAttribute('data-section', 'session-follow')
  await page.keyboard.press('ArrowRight')
  await expect(present(page)).toHaveAttribute('data-step', '1')

  // Both forms register the same session plugin, and it starts in both.
  const sessionPlugins = async () => {
    await page.locator('.pm-presenter-panels summary').click()
    const plugins = page.locator('.pm-start-report [data-plugin^="presmium.session"]')
    await expect(plugins).toHaveCount(1)
    await expect(plugins).toHaveAttribute('data-plugin', 'presmium.session')
    await expect(plugins).toHaveAttribute('data-status', 'started')
  }
  await page.goto(`${offline().web}/session.html?view=presenter&section=session`)
  await sessionPlugins()

  // The slides: the presenter view's panel says the same (in the slides' language); the slides still step.
  await page.goto(`${offline().slides}/presenter/session`)
  await sessionPlugins()
  await expect(page.locator('[data-panel="presmium.session"] .pm-session')).toHaveAttribute('data-connection', 'offline')
  await expect(page.locator('[data-panel="presmium.session"] .pm-session')).toHaveAttribute('data-status', 'idle')
  await page.goto(`${offline().slides}/session`)
  await expect(page.locator('.slidev-page').getByRole('heading', { name: '课堂会话' })).toBeVisible()
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('.slidev-page').getByRole('heading', { name: '跟随与自主' })).toBeVisible()
})

// ---------------------------------------------------------------------------
// A deck with a classroom server
// ---------------------------------------------------------------------------

/** Names the classroom server in the frontmatter of the deck copy in `dir`. */
function withServer(dir: string, server: string): void {
  const file = join(dir, 'lecture.md')
  writeFileSync(file, readFileSync(file, 'utf8').replace('presmium:\n', `presmium:\n  presmium.session:\n    server: ${server}\n`))
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
  let deck: FixtureDeck

  test.beforeAll(async () => {
    test.setTimeout(600_000)
    classroom = await startClassroomServer()
    deck = await buildFixture('session', { edit: dir => withServer(dir, classroom.url) })
  })

  test.afterAll(async () => {
    await deck?.close()
    classroom?.child.kill('SIGTERM')
  })

  test('in the web form a learner follows the presenter, browses alone, comes back in one click, and sees the classroom end', async ({ browser }) => {
    const { presenter, learner, close } = await people(browser)

    await presenter.goto(`${deck.web}/session.html`)
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

  test('a learner who opens the bare join link of the QR code gives a nickname and joins', async ({ browser }) => {
    const { presenter, learner, close } = await people(browser)
    await presenter.goto(`${deck.web}/session.html`)
    await panelButton(presenter).click()
    const panel = presenter.getByRole('dialog', { name: '课堂' })
    await panel.getByLabel('昵称').fill('王老师')
    await panel.getByRole('button', { name: '创建课堂' }).click()
    await expect(panel.getByRole('img', { name: '加入课堂的二维码' }).locator('svg')).toBeVisible()
    // The link the QR code holds, without a name.
    const link = (await panel.locator('.pm-session__link').getAttribute('href'))!
    const room = new URL(link).searchParams.get('room')!

    await learner.goto(link)
    await expect(badge(learner)).toContainText(`加入课堂 ${room}`)
    await badge(learner).getByLabel('昵称').fill('小刚')
    await badge(learner).getByRole('button', { name: '加入课堂' }).click()
    await expect(badge(learner)).toContainText('正在跟随主讲')
    await expect(panel.getByRole('list', { name: '参与者' })).toContainText('小刚')
    await close()
  })

  test('in the slides form a learner follows the presenter from slide to slide and click to click, with Slidev\'s state', async ({ browser }) => {
    const { presenter, learner, close } = await people(browser)

    // The classroom is in the presenter view's Presmium panel.
    await presenter.goto(`${deck.slides}/presenter/2`)
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
