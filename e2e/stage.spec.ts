import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { useFixture } from './fixtures/deck.ts'

test.describe.configure({ mode: 'default' })
const deck = useFixture('stage')
const basics = () => deck().slide('stage-basics')
const steps = () => deck().slide('stage-steps')

function coversCentre(page: Page, selector: string) {
  return page.evaluate(sel => !!document.elementFromPoint(innerWidth / 2, innerHeight / 2)?.closest(sel), selector)
}

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
