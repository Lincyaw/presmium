import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { playwrightBrowsers, startStudio } from './fixtures/workbench/studio.ts'
import type { Studio } from './fixtures/workbench/studio.ts'

// The workbench's Export pane: the document's builds and exports as jobs of the workspace service.

const EXAMPLE = fileURLToPath(new URL('../examples/animations', import.meta.url))

test.use({ locale: 'zh-CN', actionTimeout: 30_000 })
test.describe.configure({ mode: 'serial', timeout: 240_000 })

let studio: Studio
let fixture: string

test.beforeAll(async () => {
  test.setTimeout(300_000)
  fixture = join(mkdtempSync(join(tmpdir(), 'presmium-export-')), 'workspace')
  execFileSync(process.execPath, [join(EXAMPLE, 'try.mjs'), fixture], { stdio: 'pipe' })
  studio = await startStudio({ port: 5671 + Number(process.env.PRESMIUM_E2E_STUDIO_PORT_OFFSET ?? 0), prefix: 'export', fixture, isolateClient: true, serviceEnv: { PLAYWRIGHT_BROWSERS_PATH: playwrightBrowsers() } })
})

test.afterAll(async () => {
  await studio?.close()
  if (fixture) rmSync(join(fixture, '..'), { recursive: true, force: true })
})

async function openExport(page: Page): Promise<void> {
  await studio.open(page)
  await page.locator('.pmw-home__card').filter({ hasText: '冒泡排序' }).locator('.pmw-home__open').click()
  await expect(page.locator('.pmw-preview[data-ready="true"]')).toBeVisible({ timeout: 90_000 })
  await page.locator('button[data-aside="export"]').click()
  await expect(page.getByRole('heading', { name: '导出' })).toBeVisible()
}

test('the Export pane makes the slides into a PDF and the notebook, with the files to open and to download', async ({ page }) => {
  await openExport(page)
  const pane = page.locator('.pmw-document__aside')
  await pane.getByRole('button', { name: '生成：幻灯片 PDF' }).click()
  const pdf = pane.locator('.pmw-job').filter({ hasText: '幻灯片 PDF' })
  await expect(pdf).toHaveAttribute('data-state', 'done', { timeout: 180_000 })
  await expect(pdf).toContainText('与当前内容一致')
  const opened = await pdf.getByRole('link', { name: '打开' }).getAttribute('href')
  expect((await page.request.get(opened!)).headers()['content-type']).toBe('application/pdf')
  const downloaded = await page.request.get((await pdf.getByRole('link', { name: '下载' }).getAttribute('href'))!)
  expect(downloaded.headers()['content-disposition']).toBe('attachment; filename="slides.pdf"')

  await pane.getByRole('button', { name: '生成：Notebook' }).click()
  const notebook = pane.locator('.pmw-job').filter({ hasText: 'Notebook' })
  await expect(notebook).toHaveAttribute('data-state', 'done', { timeout: 120_000 })
  // A notebook is not shown by the browser: downloaded only.
  await expect(notebook.getByRole('link', { name: '打开' })).toHaveCount(0)
  await expect(notebook.getByRole('link', { name: '下载' })).toHaveAttribute('href', /lecture\.ipynb\?download$/)
})

test('a job started elsewhere (as the AI\'s build) shows in the pane as it runs, and the author can cancel it', async ({ page }) => {
  await openExport(page)
  const pane = page.locator('.pmw-document__aside')
  const started = await page.request.post(`${studio.service.url}/__presmium/presmium.workspace/jobs?document=bubble-sort`, {
    headers: { Authorization: `Bearer ${studio.service.token}` },
    data: { target: 'video' },
  })
  expect(started.ok()).toBe(true)
  const video = pane.locator('.pmw-job').filter({ hasText: '讲授视频' })
  await expect(video).toHaveAttribute('data-state', /queued|running/)
  await expect(page.locator('button[data-aside="export"]')).toContainText('1')
  await video.getByRole('button', { name: '取消' }).click()
  await expect(video).toHaveAttribute('data-state', 'cancelled', { timeout: 60_000 })
  await expect(page.locator('button[data-aside="export"]')).not.toContainText('1')
})
