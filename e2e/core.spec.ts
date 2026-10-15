import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { SLIDES } from './urls.ts'

// examples/demo/pages/core.md is the first page after the cover.
const CORE = `${SLIDES}/2`
const PRESENTER = `${SLIDES}/presenter/2`

/** Waits until the core slide is shown and the kernel has started its plugins. */
async function openCore(page: Page, url = CORE) {
  await page.goto(url)
  const slide = page.locator('.slidev-layout.pm-core').first()
  await expect(slide.locator('.pm-demo-greeting')).toContainText('presmium.demo.provider')
  return slide
}

async function openPanels(page: Page) {
  const panels = page.locator('.pm-presenter-panels')
  await panels.locator('summary').click()
  return panels
}

test('jumping to step 3 renders the same DOM as stepping there from step 0', async ({ page }) => {
  const jumped = await openCore(page, `${CORE}?clicks=3`)
  await expect(jumped.locator('.pm-demo-stepper')).toHaveAttribute('data-step', '3')
  const expected = await jumped.innerHTML()

  const stepped = await openCore(page)
  const stepper = stepped.locator('.pm-demo-stepper')
  await expect(stepper).toHaveAttribute('data-step', '0')
  for (const step of ['1', '2', '3']) {
    await page.keyboard.press('ArrowRight')
    await expect(stepper).toHaveAttribute('data-step', step)
  }
  expect(await stepped.innerHTML()).toBe(expected)
})

test('a consumer plugin gets the provider service; a plugin missing a required service is disabled', async ({ page }) => {
  const slide = await openCore(page)
  await expect(slide.locator('.pm-demo-greeting')).toHaveText('presmium.demo.consumer 收到 presmium.demo.provider 的问候')

  await openCore(page, PRESENTER)
  const report = (await openPanels(page)).locator('.pm-start-report')
  await expect(report.locator('[data-plugin="presmium.demo.provider"]')).toHaveAttribute('data-status', 'started')
  await expect(report.locator('[data-plugin="presmium.demo.consumer"]')).toHaveAttribute('data-status', 'started')
  const orphan = report.locator('[data-plugin="presmium.demo.orphan"]')
  await expect(orphan).toHaveAttribute('data-status', 'disabled')
  await expect(orphan).toContainText('presmium.demo.missing')
})

test('a throwing component shows a placeholder while the rest of the slide renders', async ({ page }) => {
  const slide = await openCore(page)
  await expect(slide.locator('[data-pm-error="PmDemoBroken"]')).toContainText('故意抛出的错误')
  await expect(slide.locator('h1')).toHaveText('宿主适配')
  await expect(slide.locator('.pm-demo-stepper')).toBeAttached()
  await expect(slide.locator('.pm-demo-animated')).toBeVisible()
})

test('presenter panels appear only in the presenter view', async ({ page }) => {
  await openCore(page, PRESENTER)
  const panels = await openPanels(page)
  await expect(panels.locator('[data-panel="presmium.core.start-report"]')).toBeVisible()
  await expect(panels.locator('.pm-component-errors [data-component="PmDemoBroken"]')).toBeVisible()

  await openCore(page)
  await expect(page.locator('.pm-presenter-panels')).toHaveCount(0)
})

test('with reduced motion the animated component shows its final state at once', async ({ page }) => {
  const animations = (bar: Locator) => bar.evaluate(el => el.getAnimations().length)

  const animated = (await openCore(page)).locator('.pm-demo-animated__bar')
  expect(await animations(animated)).toBe(1)

  await page.emulateMedia({ reducedMotion: 'reduce' })
  const still = (await openCore(page)).locator('.pm-demo-animated__bar')
  expect(await animations(still)).toBe(0)
  expect(await still.evaluate(el => getComputedStyle(el).transform)).toBe('none')
})

test('the slides form hides doc-only content', async ({ page }) => {
  const slide = await openCore(page)
  await expect(slide.locator('[doc-only]')).toBeHidden()
})
