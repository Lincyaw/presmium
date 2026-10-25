import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { startStudio } from './fixtures/workbench/studio.ts'
import type { Studio } from './fixtures/workbench/studio.ts'

let studio: Studio
test.use({ locale: 'zh-CN', actionTimeout: 30_000 })
test.describe.configure({ mode: 'serial', timeout: 180_000 })
test.beforeAll(async () => {
  studio = await startStudio({ port: 5693 + Number(process.env.PRESMIUM_E2E_STUDIO_PORT_OFFSET ?? 0), prefix: 'presentation-controls', fixture: fileURLToPath(new URL('./fixtures/presentation-controls', import.meta.url)), isolateClient: true })
})
test.afterAll(async () => studio?.close())

const preview = (page: Page) => page.frameLocator('.pmw-preview__frame[data-renderer="web"]')
async function open(page: Page, title: string) {
  await studio.open(page)
  await page.locator('.pmw-home__card').filter({ hasText: title }).locator('.pmw-home__open').click()
  await expect(page.locator('.pmw-preview[data-ready="true"]')).toBeVisible({ timeout: 90_000 })
  await page.getByRole('group', { name: '视图', exact: true }).getByRole('button', { name: '放映', exact: true }).click()
  await expect(preview(page).locator('.pm-present')).toBeVisible()
}

test('compact icons keep their names and shortcuts, fit one row in both themes and sizes, and work by pointer and keyboard', async ({ page }) => {
  for (const width of [1440, 390]) {
    for (const scheme of ['light', 'dark'] as const) {
      await page.setViewportSize({ width, height: 900 })
      await page.emulateMedia({ colorScheme: scheme })
      await open(page, '紧凑放映')
      const frame = preview(page)
      const present = frame.locator('.pm-present')
      const bar = frame.locator('.pm-present__bar')
      await expect(frame.locator('html')).toHaveClass(scheme === 'dark' ? /dark/ : /^(?!.*\bdark\b)/)
      for (const label of ['上一步', '下一步', '总览', '全屏', '退出放映']) {
        const control = bar.getByRole('button', { name: label, exact: true })
        await expect(control.locator('svg')).toHaveCount(1)
        expect(await control.textContent()).toBe('')
        const box = (await control.boundingBox())!
        expect(box.width).toBeLessThanOrEqual(32)
        expect(box.height).toBeGreaterThanOrEqual(24)
        expect((await control.locator('svg').boundingBox())!.width).toBeLessThanOrEqual(16)
      }
      expect((await bar.boundingBox())!.height).toBeLessThanOrEqual(44)
      await present.focus()
      await page.keyboard.press('ArrowRight')
      await expect(present).toHaveAttribute('data-section', 'second')
      await page.keyboard.press('ArrowLeft')
      await expect(present).toHaveAttribute('data-section', 'intro')
      const prev = bar.getByRole('button', { name: '上一步', exact: true })
      await prev.click()
      await page.keyboard.press('Space')
      await expect(present).toHaveAttribute('data-section', 'intro')
      const next = bar.getByRole('button', { name: '下一步', exact: true })
      await next.focus()
      await page.keyboard.press('Enter')
      await expect(present).toHaveAttribute('data-section', 'second')
      await bar.getByRole('button', { name: '总览', exact: true }).click()
      await expect(frame.getByRole('dialog', { name: '总览', exact: true })).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(frame.getByRole('dialog', { name: '总览', exact: true })).toHaveCount(0)
      await page.keyboard.press('o')
      await expect(frame.getByRole('dialog', { name: '总览', exact: true })).toBeVisible()
      await page.keyboard.press('o')
      await expect(frame.getByRole('dialog', { name: '总览', exact: true })).toHaveCount(0)
      await page.screenshot({ path: test.info().outputPath(`controls-${width}-${scheme}.png`) })
      await next.hover()
      await expect(frame.getByRole('tooltip')).toContainText('下一步 · →')
      await prev.focus()
      await expect(frame.getByRole('tooltip')).toContainText('上一步 · ←')
    }
  }
})

test('localized full screen icons and Shift+F toggle real full screen inside the workbench, and Escape exits the presentation', async ({ page }) => {
  await open(page, 'Compact presentation')
  const frame = preview(page)
  const bar = frame.locator('.pm-present__bar')
  const fullscreen = () => frame.locator('html').evaluate(() => Boolean(document.fullscreenElement))
  await bar.getByRole('button', { name: 'Full screen', exact: true }).click()
  await expect.poll(fullscreen).toBe(true)
  await expect(bar.getByRole('button', { name: 'Exit full screen', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Shift+F')
  await expect.poll(fullscreen).toBe(false)
  await frame.locator('.pm-present').focus()
  await page.keyboard.press('Shift+F')
  await expect.poll(fullscreen).toBe(true)
  await bar.getByRole('button', { name: 'Exit full screen', exact: true }).click()
  await expect.poll(fullscreen).toBe(false)
  await frame.locator('.pm-present').focus()
  await page.keyboard.press('Escape')
  await expect(frame.locator('.pm-present')).toHaveCount(0)
  await expect(page.getByRole('group', { name: '视图', exact: true }).getByRole('button', { name: '文档', exact: true })).toHaveAttribute('aria-pressed', 'true')
})
