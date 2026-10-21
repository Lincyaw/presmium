import { copyFileSync, cpSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { startStudio } from './fixtures/workbench/studio.ts'
import type { Studio } from './fixtures/workbench/studio.ts'

test.use({ locale: 'zh-CN', actionTimeout: 30_000 })
test.describe.configure({ timeout: 120_000 })

let studio: Studio

test.beforeAll(async () => {
  test.setTimeout(300_000)
  const fixture = mkdtempSync(join(tmpdir(), 'presmium-preview-loading-'))
  try {
    cpSync(fileURLToPath(new URL('./fixtures/workbench/workspace', import.meta.url)), fixture, { recursive: true })
    copyFileSync(fileURLToPath(new URL('./fixtures/preview-loading/lecture.md', import.meta.url)), join(fixture, 'lectures/intro/lecture.md'))
    studio = await startStudio({ port: 5649 + Number(process.env.PRESMIUM_E2E_STUDIO_PORT_OFFSET ?? 0), prefix: 'preview-loading', fixture })
  } finally {
    rmSync(fixture, { recursive: true, force: true })
  }
})

test.afterAll(async () => {
  await studio?.close()
})

test('returns to the document while its first slides preview is still starting', async ({ page }) => {
  const errors: string[] = []
  const requestedViews: (string | null)[] = []
  let slidesReplied = false
  const isPreview = (address: string, view?: string) => {
    const url = new URL(address)
    return url.pathname === '/api/presmium/preview' && url.searchParams.get('document') === 'lectures/intro'
      && (view === undefined || url.searchParams.get('view') === view)
  }
  page.on('pageerror', error => errors.push(error.message))
  page.on('request', request => {
    if (isPreview(request.url())) requestedViews.push(new URL(request.url()).searchParams.get('view'))
  })
  page.on('response', response => {
    if (isPreview(response.url(), 'slides')) slidesReplied = true
  })

  await studio.open(page)
  await page.locator('.pmw-home__card').filter({ hasText: '分词入门' }).locator('.pmw-home__open').click()
  const panel = page.locator('.pmw-preview')
  const frame = page.locator('.pmw-preview__frame')
  const document = page.getByRole('radiogroup', { name: '预览的形态', exact: true }).getByRole('radio', { name: '文档', exact: true })
  await expect(panel).toHaveAttribute('data-ready', 'true', { timeout: 90_000 })
  await expect(page.frameLocator('.pmw-preview__frame').locator('.pm-section').first()).toBeVisible()
  expect(requestedViews[0]).toBe('web')

  const requestedSlides = page.waitForRequest(request => isPreview(request.url(), 'slides'))
  const slidesResponse = page.waitForResponse(response => isPreview(response.url(), 'slides'))
  await page.getByRole('radiogroup', { name: '预览的形态', exact: true }).getByRole('radio', { name: '幻灯片', exact: true }).click()
  await requestedSlides
  expect(slidesReplied).toBe(false)
  await document.click()
  expect(slidesReplied).toBe(false)

  const response = await slidesResponse
  expect(response.status()).toBe(200)
  await response.finished()
  await expect(document).toHaveAttribute('aria-checked', 'true')
  await expect(panel).toHaveAttribute('data-ready', 'true')
  await expect(frame).toHaveAttribute('src', /\/lectures\/intro\//)
  await expect(frame).not.toHaveAttribute('src', /\/__presmium\/presmium\.workspace\/slides\//)
  await expect(page.frameLocator('.pmw-preview__frame').locator('.pm-section').first()).toBeVisible()
  expect(requestedViews).toContain('slides')
  expect(errors).toEqual([])
})
