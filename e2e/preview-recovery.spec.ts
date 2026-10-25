import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { startStudio } from './fixtures/workbench/studio.ts'
import type { Studio } from './fixtures/workbench/studio.ts'
import { selectView } from './fixtures/workbench/ui.ts'

const FIXTURE = fileURLToPath(new URL('./fixtures/preview-recovery', import.meta.url))
const portOffset = Number(process.env.PRESMIUM_E2E_STUDIO_PORT_OFFSET ?? 0)
let studio: Studio

test.describe.configure({ mode: 'serial', timeout: 300_000 })
test.use({ locale: 'zh-CN', actionTimeout: 30_000 })
test.beforeAll(async () => {
  studio = await startStudio({ port: 5677 + portOffset, prefix: 'preview-recovery', fixture: FIXTURE })
})
test.afterAll(async () => studio?.close())

const preview = (page: Page) => page.frameLocator('.pmw-preview__frame')
const views = (page: Page) => page.getByRole('group', { name: '视图' })
async function openDocument(page: Page, title: string): Promise<void> {
  await page.locator('.pmw-home__card').filter({ hasText: title }).locator('.pmw-home__open').click()
  await expect(page.locator('.pmw-preview__frame')).toHaveAttribute('title', title)
}

test('presentation is the same viewer even when no slides exporter is installed, and renderer edits add no extra view', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await studio.open(page)
  await openDocument(page, 'Recoverable preview')
  await expect(preview(page).getByText('The recovered slide.', { exact: true })).toBeVisible({ timeout: 120_000 })
  const original = await page.locator('.pmw-preview__frame').elementHandle()
  await expect(views(page).getByRole('button')).toHaveText(['文档', '放映'])
  await selectView(page, 'slides')
  await expect(preview(page).locator('.pm-slide')).toContainText('The recovered slide.')
  expect(await original!.evaluate(element => element === document.querySelector('.pmw-preview__frame'))).toBe(true)
  await selectView(page, 'web')
  await expect(preview(page).locator('.pm-sheet')).toContainText('The recovered slide.')
  await page.getByRole('button', { name: '文稿', exact: true }).click()
  await openDocument(page, 'Web preview')
  const file = join(studio.workspace.dir, 'web-only/lecture.md')
  const source = readFileSync(file, 'utf8')
  await selectView(page, 'slides')
  await expect(preview(page).locator('.pm-slide')).toContainText('A working web preview.')
  writeFileSync(file, source.replace('  web: {}', '  web: {}\n  slides: {}'))
  await expect(preview(page).locator('.pm-slide')).toContainText('A working web preview.')
  await expect(views(page).getByRole('button')).toHaveText(['文档', '放映'])
  writeFileSync(file, source)
})

test('a presentation fits its slides to the canvas and exposes navigation controls', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await studio.open(page)
  await openDocument(page, 'Recoverable preview')
  await selectView(page, 'slides')
  await expect(page.locator('.pmw-preview')).toHaveAttribute('data-ready', 'true', { timeout: 120_000 })
  await expect(preview(page).locator('.pm-slide')).toContainText('The recovered slide.')
  const slide = (await preview(page).locator('.pm-slide').boundingBox())!
  expect(Math.abs(slide.width / slide.height - 16 / 9)).toBeLessThan(0.02)
  await expect(preview(page).locator('.pm-present__bar')).toBeVisible()
  await expect(page.getByRole('navigation', { name: '导航' }).locator('.pmw-navigation__item')).toHaveText(['1Recoverable preview'])
  await expect(page.locator('.pmw-statusbar')).toContainText('幻灯片 1 / 1')
})
