import { expect, test } from '@playwright/test'
import { startStudio } from './fixtures/workbench/studio.ts'
import type { Studio } from './fixtures/workbench/studio.ts'
import { selectPreview } from './fixtures/workbench/ui.ts'

test.describe.configure({ mode: 'serial', timeout: 180_000 })
test.use({ locale: 'zh-CN' })

let studio: Studio
test.beforeAll(async () => {
  studio = await startStudio({ port: 6991 + Number(process.env.PRESMIUM_E2E_STUDIO_PORT_OFFSET ?? 0), prefix: 'workbench-shortcuts' })
})
test.afterAll(async () => { await studio?.close() })

test('Quick Open and commands remain available after the teacher focuses the lecture iframe', async ({ page }) => {
  await studio.open(page)
  await page.locator('.pmw-home__card').filter({ hasText: '分词入门' }).locator('.pmw-home__open').click()
  const preview = page.frameLocator('.pmw-preview__frame')
  const text = preview.getByText('这一段要改的词是 alpha。', { exact: true })
  await expect(text).toBeVisible({ timeout: 60_000 })
  await expect(page.locator('.pmw-preview')).toHaveAttribute('data-ready', 'true')

  await text.click()
  await page.keyboard.press('ControlOrMeta+p')
  const search = page.getByRole('combobox', { name: '搜索文件、文档或命令' })
  await expect(search).toBeFocused()
  await search.fill('examples/sample-repo/src/bpe.py:2')
  await search.press('Enter')
  await expect(page.locator('.pmw-source__editor')).toHaveAttribute('data-path', 'examples/sample-repo/src/bpe.py')
  await expect(page.locator('[data-status="line"]')).toHaveText('第 2 行')

  await selectPreview(page)
  await text.click()
  await page.keyboard.press('ControlOrMeta+Shift+p')
  await expect(page.getByRole('dialog', { name: '命令面板' })).toBeVisible()
  await expect(search).toBeFocused()
  await expect(search).toHaveValue('>')
  await search.fill('>显示预览')
  await search.press('Enter')
  await expect(page.locator('.pmw-preview__frame')).toBeVisible()
  await expect(page.getByRole('tab', { name: '文档预览', exact: true })).toHaveAttribute('aria-selected', 'true')
})
