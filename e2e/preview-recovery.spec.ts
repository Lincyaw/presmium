import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { startStudio } from './fixtures/workbench/studio.ts'
import type { Studio } from './fixtures/workbench/studio.ts'
import { openPreviewMenu, selectPreview } from './fixtures/workbench/ui.ts'

const FIXTURE = fileURLToPath(new URL('./fixtures/preview-recovery', import.meta.url))
const SLIDES = fileURLToPath(new URL('../packages/render-slides/src/node/presmium.ts', import.meta.url))
const portOffset = Number(process.env.PRESMIUM_E2E_STUDIO_PORT_OFFSET ?? 0)
let studio: Studio

test.describe.configure({ mode: 'serial', timeout: 300_000 })
test.use({ locale: 'zh-CN', actionTimeout: 30_000 })
test.beforeAll(async () => {
  studio = await startStudio({ port: 5677 + portOffset, prefix: 'preview-recovery', fixture: FIXTURE })
})
test.afterAll(async () => studio?.close())

const preview = (page: Page) => page.frameLocator('.pmw-preview__frame')
const controls = (page: Page) => page.locator('.pmw-preview__bar')
async function openDocument(page: Page, title: string): Promise<void> {
  await page.locator('.pmw-home__card').filter({ hasText: title }).locator('.pmw-home__open').click()
  await expect(page.locator('.pmw-preview__frame')).toHaveAttribute('title', `${title} 的预览`)
}

test('a failed slides preview can return to web and retry after repair; renderer edits update the available views', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await studio.open(page)
  await openDocument(page, 'Recoverable preview')
  await expect(preview(page).getByText('The recovered slide.', { exact: true })).toBeVisible({ timeout: 120_000 })
  await selectPreview(page, 'slides')
  const failure = page.getByText(/^预览不可用：.*renderer slides is not installed:/)
  await expect(failure).toBeVisible()
  await expect(page.getByText('这份文稿没有幻灯片形态。', { exact: true })).toBeHidden()
  await selectPreview(page, 'web')
  await expect(preview(page).getByText('The recovered slide.', { exact: true })).toBeVisible()
  await selectPreview(page, 'slides')
  await expect(failure).toBeVisible()

  const renderer = join(studio.workspace.dir, 'broken/slides-renderer')
  mkdirSync(renderer)
  writeFileSync(join(renderer, 'package.json'), JSON.stringify({ name: 'preview-recovery-renderer', private: true, type: 'module', exports: { './presmium': './plugin.ts' } }))
  writeFileSync(join(renderer, 'plugin.ts'), `export { default } from ${JSON.stringify(SLIDES)}\n`)
  await controls(page).getByRole('button', { name: '重新载入预览', exact: true }).click()
  await expect(failure).toBeHidden()
  await expect(page.locator('.pmw-preview')).toHaveAttribute('data-ready', 'true', { timeout: 120_000 })
  await expect(preview(page).getByText('The recovered slide.', { exact: true })).toBeVisible()

  await page.locator('[data-activity="documents"]').click()
  await openDocument(page, 'Web preview')
  await expect(page.getByText('这份文稿没有幻灯片形态。', { exact: true })).toBeHidden()
  await expect(page.getByRole('tab', { name: '文档预览', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect(preview(page).getByText('A working web preview.', { exact: true })).toBeVisible({ timeout: 120_000 })
  await openPreviewMenu(page)
  await expect(page.getByRole('menuitem', { name: '幻灯片预览', exact: true })).toBeDisabled()
  await page.keyboard.press('Escape')

  const file = join(studio.workspace.dir, 'web-only/lecture.md')
  const original = readFileSync(file, 'utf8')
  let previewReads = 0
  page.on('request', request => {
    const url = new URL(request.url())
    if (url.pathname.endsWith('/api/presmium/preview') && url.searchParams.get('document') === 'web-only') previewReads++
  })
  writeFileSync(file, `${original}\nAn ordinary body edit.\n`)
  await expect(preview(page).getByText('An ordinary body edit.', { exact: true })).toBeVisible()
  expect(previewReads).toBe(0)
  writeFileSync(file, original.replace('  web: {}', '  web: {}\n  slides: {}'))
  await openPreviewMenu(page)
  await expect(page.getByRole('menuitem', { name: '幻灯片预览', exact: true })).toBeEnabled()
  await page.getByRole('menuitem', { name: '幻灯片预览', exact: true }).click()
  await expect(page.locator('.pmw-preview')).toHaveAttribute('data-ready', 'true', { timeout: 120_000 })
  await expect(preview(page).getByText('A working web preview.', { exact: true })).toBeVisible()
  writeFileSync(file, original)
  await expect(page.getByText('这份文稿没有幻灯片形态。', { exact: true })).toBeVisible()
  await selectPreview(page, 'web')
  await expect(preview(page).getByText('A working web preview.', { exact: true })).toBeVisible()
})
