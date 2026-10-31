import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { playwrightBrowsers, startStudio } from './fixtures/workbench/studio.ts'
import type { Studio } from './fixtures/workbench/studio.ts'

// The workbench's Export pane: the document's builds and exports as jobs of the workspace service.

const EXAMPLE = fileURLToPath(new URL('../examples/gallery', import.meta.url))

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

test('document and presentation reuse one compiled viewer and show edits without reloading its window', async ({ page }) => {
  await studio.open(page)
  await page.locator('.pmw-home__card').filter({ hasText: '冒泡排序' }).locator('.pmw-home__open').click()
  await expect(page.locator('.pmw-preview[data-ready="true"]')).toBeVisible({ timeout: 90_000 })
  const frame = page.locator('.pmw-preview__frame[data-renderer="web"]')
  const original = await frame.elementHandle()
  const web = page.frameLocator('.pmw-preview__frame[data-renderer="web"]')
  let loads = 0
  page.on('request', request => { if (request.resourceType() === 'document' && request.url().includes('/__app/view')) loads++ })
  const view = page.getByRole('group', { name: '视图', exact: true })
  for (let round = 0; round < 2; round++) {
    await view.getByRole('button', { name: '放映', exact: true }).click()
    await expect(web.locator('.pm-lecture-player')).toBeVisible({ timeout: 30_000 })
    expect(await original!.evaluate(element => element === document.querySelector('.pmw-preview__frame[data-renderer="web"]'))).toBe(true)
    await view.getByRole('button', { name: '文档', exact: true }).click()
    await expect(web.locator('.pm-section').first()).toBeVisible()
    await expect(web.locator('.pm-lecture-player')).toHaveCount(0)
  }
  const entry = join(studio.workspace.dir, 'bubble-sort/lecture.md')
  const originalSource = readFileSync(entry, 'utf8')
  writeFileSync(entry, originalSource.replace('用一个动画讲清楚冒泡排序的一趟。', '共享预览：修改后文档和讲授视频都使用最新内容。'))
  await expect(web.locator('.pm-section').first()).toContainText('共享预览：修改后', { timeout: 30_000 })
  await view.getByRole('button', { name: '放映', exact: true }).click()
  await expect(web.locator('.pm-lecture-player [data-unsaid]')).toBeVisible({ timeout: 30_000 })
  expect(loads).toBe(0)
  expect(await original!.evaluate(element => element === document.querySelector('.pmw-preview__frame[data-renderer="web"]'))).toBe(true)
  writeFileSync(entry, originalSource)
})

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

test('one presentation entry plays the configured lecture and keeps video creation in Export', async ({ page }) => {
  await studio.open(page)
  await page.locator('.pmw-home__card').filter({ hasText: '冒泡排序' }).locator('.pmw-home__open').click()
  await expect(page.locator('.pmw-preview[data-ready="true"]')).toBeVisible({ timeout: 90_000 })
  const views = page.getByRole('group', { name: '视图', exact: true })
  await expect(views.getByRole('button')).toHaveText(['文档', '放映'])
  await views.getByRole('button', { name: '放映', exact: true }).click()
  const frame = page.frameLocator('.pmw-preview__frame[data-renderer="web"]')
  const player = frame.locator('.pm-lecture-player')
  await expect(player).toBeInViewport({ timeout: 60_000 })
  await expect(frame.locator('.pm-present')).toBeVisible()
  // A normal pointer click must reach the player, with no forced click through the slide's stacking context.
  await player.locator('.pm-lecture-player__play').click()
  await expect(player).toHaveAttribute('data-state', 'playing')
  await expect.poll(async () => Number(await player.getAttribute('data-time')), { timeout: 20_000 }).toBeGreaterThan(500)
  await player.locator('.pm-lecture-player__play').click()
  await expect(player).toHaveAttribute('data-state', 'paused')
  await views.getByRole('button', { name: '文档', exact: true }).click()
  await expect(frame.locator('.pm-sheet .pm-section').first()).toBeVisible()
  await expect(player).toHaveCount(0)
  await views.getByRole('button', { name: '放映', exact: true }).click()
  await expect(player).toBeInViewport()
  await expect(page.getByRole('group', { name: '视频文件' })).toHaveCount(0)
  await page.locator('button[data-aside="export"]').click()
  const pane = page.locator('.pmw-document__aside')
  await pane.getByRole('button', { name: '生成：讲授视频', exact: true }).click()
  const job = pane.locator('.pmw-job').filter({ hasText: '讲授视频' }).first()
  await expect(job).toHaveAttribute('data-state', /queued|running/)
  await job.getByRole('button', { name: '取消', exact: true }).click()
  await expect(job).toHaveAttribute('data-state', 'cancelled', { timeout: 60_000 })
  for (const width of [1440, 390]) {
    for (const scheme of ['light', 'dark'] as const) {
      await page.setViewportSize({ width, height: 900 })
      await page.emulateMedia({ colorScheme: scheme })
      await studio.open(page)
      await page.locator('.pmw-home__card').filter({ hasText: '冒泡排序' }).locator('.pmw-home__open').click()
      await views.getByRole('button', { name: '放映', exact: true }).click()
      await expect(frame.locator('html')).toHaveClass(scheme === 'dark' ? /dark/ : /^(?!.*\bdark\b)/)
      await expect(player).toBeInViewport()
      const slideBox = (await frame.locator('.pm-slide').boundingBox())!
      const playerBox = (await player.boundingBox())!
      // The player takes layout space: the entire slide fits above it in every theme and viewport.
      expect(slideBox.y + slideBox.height).toBeLessThanOrEqual(playerBox.y + 1)
      await player.locator('.pm-lecture-player__play').click()
      await expect(player).toHaveAttribute('data-state', 'playing')
      const before = Number(await player.getAttribute('data-time'))
      await expect.poll(async () => Number(await player.getAttribute('data-time'))).toBeGreaterThan(before + 250)
      await player.locator('.pm-lecture-player__play').click()
      await expect(player).toHaveAttribute('data-state', 'paused')
      await frame.locator('.pm-present__bar').getByRole('button', { name: '下一步', exact: true }).click()
      await expect(frame.locator('.pm-slide')).toHaveAttribute('data-section', 'pass')
      await expect(frame.locator('.bs__bar').first()).toBeVisible()
      await expect.poll(async () => {
        const body = (await frame.locator('.pm-slide__body').boundingBox())!
        const content = (await frame.locator('.pm-slide__content').boundingBox())!
        return content.y + content.height - (body.y + body.height)
      }).toBeLessThanOrEqual(1)
      await page.screenshot({ path: test.info().outputPath(`presentation-${width}-${scheme}.png`) })
    }
  }

})

test('a sentence the voice cannot say yet plays silent in the presentation with its caption, and Export says why its video is not made', async ({ page }) => {
  // A new sentence: not in the synthesis cache, and this machine names no engine for the voice.
  const lecture = join(studio.workspace.dir, 'bubble-sort/lecture.md')
  writeFileSync(lecture, readFileSync(lecture, 'utf8').replace('用一个动画讲清楚冒泡排序的一趟。', '这一句是新写的，还没有合成语音。'))
  await studio.open(page)
  await page.locator('.pmw-home__card').filter({ hasText: '冒泡排序' }).locator('.pmw-home__open').click()
  await expect(page.locator('.pmw-preview[data-ready="true"]')).toBeVisible({ timeout: 90_000 })
  await page.getByRole('group', { name: '视图' }).getByRole('button', { name: '放映', exact: true }).click()
  const video = page.frameLocator('.pmw-preview__frame[data-renderer="web"]')
  await expect(video.locator('.pm-lecture-player [data-unsaid]')).toContainText('有 1 句还没能合成语音', { timeout: 60_000 })
  await video.locator('.pm-lecture-player__play').click()
  // Its caption is shown above the player, captions off or on.
  await expect(video.locator('.pm-lecture-caption')).toBeVisible()
  await expect(video.locator('.pm-lecture-caption')).toContainText('这一句是新写的')
  await expect.poll(async () => Number(await video.locator('.pm-lecture-player').getAttribute('data-time')), { timeout: 20_000 }).toBeGreaterThan(500)

  await page.locator('button[data-aside="export"]').click()
  const pane = page.locator('.pmw-document__aside')
  await pane.getByRole('button', { name: '生成：讲授视频', exact: true }).click()
  const job = pane.locator('.pmw-job').filter({ hasText: '讲授视频' }).first()
  await expect(job).toHaveAttribute('data-state', 'failed', { timeout: 180_000 })
  await expect(job.locator('.pmw-job__error')).toContainText('could not be said')
})
