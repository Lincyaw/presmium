import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { SLIDES, WEB } from './urls.ts'

// examples/demo/pages/stage.md: a section of basic content, then a section whose list reveals an
// item per step with a paragraph of narration per step. Both forms are built by `presmium build`.
const WEB_BUILT = existsSync(fileURLToPath(new URL('../examples/demo/dist/web/index.html', import.meta.url)))
let basics: number
let steps: number

/** Slide numbers by content: a few seconds after start Slidev mounts every slide, each in `.slidev-page-<no>`. */
test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage()
  await page.goto(`${SLIDES}/1`)
  const slideNo = async (layout: string) => {
    const slide = page.locator(`.slidev-layout.${layout}`).first()
    await slide.waitFor({ state: 'attached', timeout: 15_000 })
    return slide.evaluate(el => Number(/slidev-page-(\d+)/.exec(el.closest('.slidev-page')?.className ?? '')?.[1]))
  }
  basics = await slideNo('pm-stage-basics')
  steps = await slideNo('pm-stage-steps')
  await page.close()
})

/** Opens the audience view and the presenter view of the basics slide in one browser. */
async function openBothViews(page: Page) {
  const audience = page
  await audience.goto(`${SLIDES}/${basics}`)
  await expect(audience.locator('.pm-stage-basics h1')).toBeVisible()
  const presenter = await page.context().newPage()
  await presenter.goto(`${SLIDES}/presenter/${basics}`)
  await expect(presenter.locator('.pm-stage-basics h1').first()).toBeVisible()
  return { audience, presenter }
}

/** Whether the element topmost at the centre of the window lies inside `selector`. */
function coversCentre(page: Page, selector: string) {
  return page.evaluate(sel => !!document.elementFromPoint(innerWidth / 2, innerHeight / 2)?.closest(sel), selector)
}

test('tables, footnotes and highlighted code are visible', async ({ page }) => {
  await page.goto(`${SLIDES}/${basics}`)
  const slide = page.locator('.slidev-layout.pm-stage-basics')

  await expect(slide.locator('table')).toBeVisible()
  await expect(slide.locator('table tbody tr')).toHaveCount(3)

  await expect(slide.locator('sup.footnote-ref')).toBeVisible()
  await expect(slide.locator('.footnotes')).toContainText('快捷键在演讲者视图和听众视图中都可用')
  await expect(slide.locator('.footnotes')).toBeInViewport()

  const code = slide.locator('pre.shiki')
  await expect(code).toBeVisible()
  const colours = await code.locator('.line span').evaluateAll(spans => new Set(spans.map(s => getComputedStyle(s).color)).size)
  expect(colours).toBeGreaterThan(2)
})

test('presenter notes highlight the current step and fade the others', async ({ page }) => {
  await page.goto(`${SLIDES}/presenter/${steps}`)
  const notes = page.locator('.slidev-note-with-clicks').first()
  // One paragraph of narration per step: the narration of the list binds to its items' steps.
  const step = (n: number) => notes.locator(':scope > p').nth(n)
  await expect(notes.locator(':scope > p')).toHaveCount(3)
  const highlighted = 'rgba(139, 92, 246, 0.12)'
  const faded = 'rgba(136, 136, 136, 0.55)'

  await expect(step(0)).toHaveCSS('background-color', highlighted)
  await expect(step(1)).toHaveCSS('color', faded)

  for (const current of [1, 2]) {
    await page.keyboard.press('ArrowRight')
    await expect(step(current)).toHaveCSS('background-color', highlighted)
    await expect(step(current)).not.toHaveCSS('color', faded)
    await expect(step(current - 1)).toHaveCSS('color', faded)
    await expect(step(current - 1)).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  }
  await expect(step(0)).toHaveCSS('color', faded)
})

test('b blacks out the audience view and b again restores it', async ({ page }) => {
  const { audience, presenter } = await openBothViews(page)

  await presenter.keyboard.press('b')
  await expect(audience.locator('.pm-stage-black')).toBeVisible()
  expect(await coversCentre(audience, '.pm-stage-black')).toBe(true)
  await expect(presenter.locator('.pm-stage-badge')).toHaveText('听众视图已黑屏')
  await expect(presenter.locator('.pm-stage-black')).toHaveCount(0)

  await presenter.keyboard.press('b')
  await expect(audience.locator('.pm-stage-black')).toHaveCount(0)
  expect(await coversCentre(audience, '.pm-stage-basics')).toBe(true)
  await expect(presenter.locator('.pm-stage-badge')).toBeHidden()
})

test('f freezes the audience view while the presenter moves on; f again resumes', async ({ page }) => {
  const { audience, presenter } = await openBothViews(page)

  await presenter.keyboard.press('f')
  const frozen = audience.locator('.pm-stage-frozen')
  await expect(frozen).toBeVisible()
  await expect(presenter.locator('.pm-stage-badge')).toHaveText('听众视图已冻结')

  await presenter.keyboard.press('ArrowRight')
  await expect(audience).toHaveURL(new RegExp(`/${steps}\\b`))
  expect(await coversCentre(audience, '.pm-stage-frozen')).toBe(true)
  await expect(frozen.locator('.pm-stage-basics h1')).toBeVisible()

  await presenter.keyboard.press('f')
  await expect(frozen).toBeHidden()
  await expect(audience.locator('.pm-stage-steps h1')).toBeVisible()
  expect(await coversCentre(audience, '.pm-stage-steps')).toBe(true)
})

test('annotations are persisted: a drawing survives a reload', async ({ page }) => {
  await page.goto(`${SLIDES}/${basics}`)
  await expect(page.locator('.pm-stage-basics h1')).toBeVisible()
  await page.getByTitle('Show drawing toolbar').click()

  const box = (await page.locator('.pm-stage-basics').boundingBox())!
  const y = box.y + box.height * 0.8
  await page.mouse.move(box.x + box.width * 0.6, y)
  await page.mouse.down()
  for (let i = 1; i <= 10; i++) await page.mouse.move(box.x + box.width * (0.6 + i * 0.03), y - i * 4)
  await page.mouse.up()
  const strokes = page.locator('.slidev-slide-content > svg path')
  await expect(strokes).not.toHaveCount(0)

  await page.reload()
  await expect(page.locator('.pm-stage-basics h1')).toBeVisible()
  await expect(strokes).not.toHaveCount(0)
})

test('the web form shows the table, the footnote at its section and the highlighted code', async ({ page }) => {
  test.skip(!WEB_BUILT, 'the web form is not built')
  await page.goto(`${WEB}/stage.html`)
  const section = page.locator('.pm-section[data-section="stage-basics"]')
  await expect(section.locator('table tbody tr')).toHaveCount(3)
  // The footnote is defined at the end of the file but belongs to the section that refers to it.
  await expect(section).toContainText('快捷键在演讲者视图和听众视图中都可用')
  await expect(page.locator('.pm-section[data-section="stage-steps"]')).not.toContainText('快捷键在演讲者视图和听众视图中都可用')
  const code = section.locator('pre.shiki')
  await expect(code).toContainText('toggleScreen')
  await expect.poll(() => code.locator('.line span').evaluateAll(spans => new Set(spans.map(s => getComputedStyle(s).color)).size)).toBeGreaterThan(2)
})
