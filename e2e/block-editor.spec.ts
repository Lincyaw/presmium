import { appendFileSync, existsSync, readFileSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { startStudio } from './fixtures/workbench/studio.ts'
import type { Studio } from './fixtures/workbench/studio.ts'
const FIXTURE = fileURLToPath(new URL('./fixtures/block-editor', import.meta.url))
let studio: Studio
test.use({ locale: 'zh-CN', actionTimeout: 20_000 })
test.describe.configure({ timeout: 180_000 })
test.beforeAll(async () => {
  if (!existsSync(join(FIXTURE, 'node_modules'))) symlinkSync(fileURLToPath(new URL('../examples/animations/node_modules', import.meta.url)), join(FIXTURE, 'node_modules'), 'junction')
  studio = await startStudio({ port: 5795, prefix: 'block-editor', fixture: FIXTURE, isolateClient: true, onServiceOutput: text => appendFileSync('/private/tmp/block-editor-service.log', text) })
})
test.afterAll(async () => studio?.close())
test('edits body blocks, preserves narration, seeks animation steps and edits their timing', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.setViewportSize({ width: 1440, height: 1000 })
  await studio.open(page)
  await page.locator('.pmw-home__card').filter({ hasText: '块编辑' }).locator('.pmw-home__open').click()
  await expect(page.locator('.pmw-preview[data-ready="true"]')).toBeVisible({ timeout: 90_000 })
  const frame = page.frameLocator('.pmw-preview__frame[data-renderer="web"]')
  const body = frame.locator('[data-section="intro"] .tiptap')
  await expect(body).toBeVisible({ timeout: 60_000 })
  await expect(body).toContainText('可编辑的正文。')
  await expect(body).not.toContainText('独立的讲解文本。')
  await body.click()
  await body.press('Meta+A')
  await page.keyboard.insertText('正文已经通过块编辑器修改。')
  await expect(frame.locator('[data-section="intro"] .pm-block-editor__status')).not.toHaveText('已保存')
  const file = join(studio.workspace.dir, 'zh/lecture.md')
  await expect.poll(() => readFileSync(file, 'utf8'), { timeout: 30_000 }).toContain('正文已经通过块编辑器修改。')
  expect(readFileSync(file, 'utf8')).toContain('独立的讲解文本。')
  await expect(body).toContainText('正文已经通过块编辑器修改。')
  await frame.locator('[data-section="animation"]').getByRole('button', { name: '跳到动画第 2 步', exact: true }).click()
  const narration = page.getByRole('region', { name: '步骤讲解', exact: true })
  const text = narration.getByRole('textbox', { name: '讲解文本', exact: true })
  await expect(text).toHaveValue('第二步的讲解。')
  await text.fill('第二步更新后的讲解。')
  await narration.getByRole('button', { name: '与动画同步', exact: true }).click()
  await narration.getByRole('button', { name: '保存', exact: true }).click()
  await expect.poll(() => readFileSync(file, 'utf8')).toContain('第二步更新后的讲解。')
  await page.getByRole('group', { name: '视图', exact: true }).getByRole('button', { name: '放映', exact: true }).click()
  await expect(frame.locator('.pm-present')).toBeVisible()
  await expect(frame.locator('.pm-present')).toHaveAttribute('data-step', '1')
  for (const width of [1440, 390]) for (const scheme of ['light', 'dark'] as const) {
    await page.setViewportSize({ width, height: 1000 })
    await page.emulateMedia({ colorScheme: scheme })
    await page.screenshot({ path: test.info().outputPath(`blocks-${width}-${scheme}.png`) })
    expect(await page.locator('body').evaluate(e => e.scrollWidth <= innerWidth + 1)).toBe(true)
  }
  expect(errors).toEqual([])
})
