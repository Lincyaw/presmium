import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { startStudio } from './fixtures/workbench/studio.ts'
import type { Studio } from './fixtures/workbench/studio.ts'

const FIXTURE = fileURLToPath(new URL('./fixtures/content-roles', import.meta.url))
let studio: Studio
test.use({ locale: 'zh-CN', actionTimeout: 30_000 })
test.describe.configure({ mode: 'serial', timeout: 180_000 })
test.beforeAll(async () => {
  studio = await startStudio({ port: 5689 + Number(process.env.PRESMIUM_E2E_STUDIO_PORT_OFFSET ?? 0), prefix: 'content-roles', fixture: FIXTURE, isolateClient: true })
})
test.afterAll(async () => studio?.close())

const preview = (page: Page) => page.frameLocator('.pmw-preview__frame[data-renderer="web"]')
async function open(page: Page, title: string) {
  await studio.open(page)
  await page.locator('.pmw-home__card').filter({ hasText: title }).locator('.pmw-home__open').click()
  await expect(page.locator('.pmw-preview[data-ready="true"]')).toBeVisible({ timeout: 90_000 })
}

test('editing distinguishes screen content, narration and reading-only text in both themes and sizes; reading and presenting hide the marks', async ({ page }) => {
  for (const width of [1440, 390]) {
    for (const scheme of ['light', 'dark'] as const) {
      await page.setViewportSize({ width, height: 900 })
      await page.emulateMedia({ colorScheme: scheme })
      await open(page, '内容标记')
      const frame = preview(page)
      await expect(frame.locator('html')).toHaveAttribute('data-preview-picking', '')
      for (const [block, role, label] of [['spoken', 'narration', '讲解 · 字幕'], ['screen', 'visual', '上屏内容'], ['reading', 'reading', '仅供阅读'], ['code', 'visual', '上屏内容']]) {
        const content = frame.locator(`.pm-block[data-block="${block}"]`)
        await expect(content).toHaveAttribute('data-content-role', role!)
        await expect(content.locator(':scope > .pm-content-marks .pm-content-mark')).toHaveAttribute('title', new RegExp(label!))
        await expect(content.locator(':scope > .pm-content-marks svg')).toBeVisible()
        await expect(content.locator(':scope > .pm-content-marks')).not.toContainText(label!)
      }
      await expect(frame.locator('.pm-section__title')).toHaveAttribute('data-content-label', '上屏内容')
      await expect(frame.locator('html')).toHaveClass(scheme === 'dark' ? /dark/ : /^(?!.*\bdark\b)/)
      await page.screenshot({ path: test.info().outputPath(`content-roles-${width}-${scheme}.png`) })
      await page.getByRole('group', { name: '模式', exact: true }).getByRole('button', { name: '查看', exact: true }).click()
      await expect(frame.locator('[data-block="spoken"] .pm-content-marks')).toBeHidden()
      await page.getByRole('group', { name: '模式', exact: true }).getByRole('button', { name: '编辑', exact: true }).click()
      await page.getByRole('group', { name: '视图', exact: true }).getByRole('button', { name: '放映', exact: true }).click()
      const slide = frame.locator('.pm-slide [data-block="screen"]')
      await expect(slide).toContainText('这句话会出现在幻灯片上。')
      expect(await slide.evaluate(element => getComputedStyle(element, '::before').content)).toBe('none')
    }
  }
})

test('labels follow the document language and never enter in-place text edits', async ({ page }) => {
  await open(page, 'Content roles')
  await expect(preview(page).locator('[data-block="spoken"]')).toHaveAttribute('data-content-label', 'Narration · Captions')
  await expect(preview(page).locator('[data-block="screen"]')).toHaveAttribute('data-content-label', 'On screen')
  await expect(preview(page).locator('[data-block="reading"]')).toHaveAttribute('data-content-label', 'Reading only')
  await open(page, '内容标记')
  const frame = preview(page)
  await frame.locator('[data-block="spoken"] p').dblclick()
  await expect(frame.locator('[data-preview-editing]')).toBeVisible()
  await page.keyboard.press('End')
  await page.keyboard.type('修改后的讲解。')
  await page.keyboard.press('Enter')
  const file = join(studio.workspace.dir, 'zh/lecture.md')
  await expect.poll(() => readFileSync(file, 'utf8')).toContain('这段是讲解，也会用来生成字幕。修改后的讲解。')
  const source = readFileSync(file, 'utf8')
  expect(source).not.toContain('讲解 · 字幕')
  expect(source).not.toContain('上屏内容')
  expect(source).not.toContain('仅供阅读')
  await expect(frame.locator('[data-block="spoken"]')).toHaveAttribute('data-content-label', '讲解 · 字幕')
})
