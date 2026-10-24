import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { useFixture } from './fixtures/deck.ts'

test.describe.configure({ mode: 'default' })
const deck = useFixture('stage')
const slides = (path: string | number) => `${deck().slides}/${path}`
const basics = () => deck().slide('stage-basics')
const steps = () => deck().slide('stage-steps')

async function openBothViews(page: Page) {
  const audience = page
  await audience.goto(slides(basics()))
  await expect(audience.locator('.pm-stage-basics h1')).toBeVisible()
  const presenter = await page.context().newPage()
  await presenter.goto(slides(`presenter/${basics()}`))
  await expect(presenter.locator('.pm-stage-basics h1').first()).toBeVisible()
  return { audience, presenter }
}

function coversCentre(page: Page, selector: string) {
  return page.evaluate(sel => !!document.elementFromPoint(innerWidth / 2, innerHeight / 2)?.closest(sel), selector)
}

test('b blacks out the audience view and b again restores it', async ({ page }) => {
  const { audience, presenter } = await openBothViews(page)

  await presenter.keyboard.press('b')
  await expect(audience.locator('.pm-stage-black')).toBeVisible()
  await expect.poll(() => coversCentre(audience, '.pm-stage-black')).toBe(true)
  await expect(presenter.locator('.pm-stage-badge')).toHaveAttribute('data-mode', 'black')
  await expect(presenter.locator('.pm-stage-black')).toHaveCount(0)

  await presenter.keyboard.press('b')
  await expect(audience.locator('.pm-stage-black')).toHaveCount(0)
  await expect.poll(() => coversCentre(audience, '.pm-stage-basics')).toBe(true)
  await expect(presenter.locator('.pm-stage-badge')).toBeHidden()
})

test('f freezes the audience view while the presenter moves on; f again resumes', async ({ page }) => {
  const { audience, presenter } = await openBothViews(page)

  await presenter.keyboard.press('f')
  const frozen = audience.locator('.pm-stage-frozen')
  await expect(frozen).toBeVisible()
  await expect(presenter.locator('.pm-stage-badge')).toHaveAttribute('data-mode', 'frozen')

  await presenter.keyboard.press('ArrowRight')
  await expect(audience).toHaveURL(new RegExp(`/${steps()}\\b`))
  await expect.poll(() => coversCentre(audience, '.pm-stage-frozen')).toBe(true)
  await expect(frozen.locator('.pm-stage-basics h1')).toBeVisible()

  await presenter.keyboard.press('f')
  await expect(frozen).toBeHidden()
  await expect(audience.locator('.pm-stage-steps h1')).toBeVisible()
  await expect.poll(() => coversCentre(audience, '.pm-stage-steps')).toBe(true)
})

test('the web form shows the table, the footnote at its section and the highlighted code', async ({ page }) => {
  await page.goto(`${deck().web}/stage.html`)
  const section = page.locator('.pm-section[data-section="stage-basics"]')
  await expect(section.locator('table tbody tr')).toHaveCount(3)
  await expect(section).toContainText('快捷键在演讲者视图和听众视图中都可用')
  await expect(page.locator('.pm-section[data-section="stage-steps"]')).not.toContainText('快捷键在演讲者视图和听众视图中都可用')
  const code = section.locator('pre.shiki')
  await expect(code).toContainText('toggleScreen')
  await expect.poll(() => code.locator('.line span').evaluateAll(spans => new Set(spans.map(s => getComputedStyle(s).color)).size)).toBeGreaterThan(2)
})

test('in the web form\'s present view, b blacks out and f freezes the audience window; the presenter window shows which', async ({ page }) => {
  await page.goto(`${deck().web}/stage.html?view=present`)
  const present = page.getByRole('region', { name: '放映' })
  await expect(present).toHaveAttribute('data-section', 'stage-basics')
  const [presenter] = await Promise.all([page.waitForEvent('popup'), page.keyboard.press('p')])
  await expect(presenter.locator('.pm-presenter')).toHaveAttribute('data-section', 'stage-basics')
  const badge = presenter.locator('.pm-presenter .pm-stage-badge')

  await page.keyboard.press('b')
  await expect(page.locator('.pm-stage-black')).toBeVisible()
  await expect.poll(() => coversCentre(page, '.pm-stage-black')).toBe(true)
  await expect(badge).toHaveAttribute('data-mode', 'black')
  await page.keyboard.press('b')
  await expect(page.locator('.pm-stage-black')).toHaveCount(0)
  await expect.poll(() => coversCentre(page, '.pm-present__slide')).toBe(true)
  await expect(badge).toHaveCount(0)

  await presenter.keyboard.press('f')
  const frozen = page.locator('.pm-stage-frozen')
  await expect(frozen).toBeVisible()
  await expect(badge).toHaveAttribute('data-mode', 'frozen')
  await presenter.keyboard.press('ArrowRight')
  await expect(present).toHaveAttribute('data-section', 'stage-steps')
  await expect.poll(() => coversCentre(page, '.pm-stage-frozen')).toBe(true)
  await expect(frozen.locator('h1')).toHaveText('讲台：基础内容')
  await presenter.keyboard.press('f')
  await expect(frozen).toBeHidden()
  await expect(present.locator('.pm-present__title')).toHaveText('讲台：步骤与画面')
  await expect.poll(() => coversCentre(page, '.pm-present__slide')).toBe(true)
})

test('the slides form has an overview: o shows every slide, a click goes to one', async ({ page }) => {
  await page.goto(slides(basics()))
  await expect(page.locator('.pm-stage-basics h1')).toBeVisible()
  const preview = page.locator('h1', { hasText: '讲台：步骤与画面' }).filter({ visible: true })
  await expect(preview).toHaveCount(0)
  await page.keyboard.press('o')
  await expect(preview).toBeVisible()
  await preview.click({ force: true })
  await expect(page).toHaveURL(new RegExp(`/${steps()}$`))
  await expect(preview).toHaveCount(1)
  await expect(page.locator('.pm-stage-steps h1').filter({ visible: true })).toBeInViewport()
})
