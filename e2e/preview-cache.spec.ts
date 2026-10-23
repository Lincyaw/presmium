import { randomUUID } from 'node:crypto'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import type { Page, Request } from '@playwright/test'
import { startStudio } from './fixtures/workbench/studio.ts'
import type { Studio } from './fixtures/workbench/studio.ts'

const INTRO = 'lectures/intro'
const SECOND = 'lectures/second'
const THIRD = 'lectures/third'
const FOURTH = 'lectures/fourth'
const frame = (page: Page, document: string) => page.locator(`iframe[data-preview-cache][data-document="${document}"]`)
const content = (page: Page, document: string) => page.frameLocator(`iframe[data-preview-cache][data-document="${document}"]`)

async function freePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('the studio test needs a TCP port')
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  return address.port
}

async function home(page: Page): Promise<void> {
  await page.locator('[data-activity="documents"]').click()
  await expect(page.locator('.pmw-home__cards')).toBeVisible()
}

async function choose(page: Page, document: string): Promise<void> {
  await page.locator(`.pmw-home__card[data-document="${document}"] .pmw-home__open`).click()
}

async function ready(page: Page, document: string): Promise<void> {
  await expect(page.locator('.pmw-preview[data-ready="true"]')).toBeVisible({ timeout: 90_000 })
  await expect(frame(page, document)).toHaveAttribute('data-active', 'true')
  await expect(frame(page, document)).toBeVisible()
  await expect(content(page, document).locator('.pm-section').first()).toBeVisible()
}

async function paused(page: Page, document: string): Promise<void> {
  const cached = frame(page, document)
  await expect(cached).toBeAttached()
  await expect(cached).toHaveClass('pmw-preview__cached-frame')
  await expect(cached).toHaveAttribute('hidden', '')
  await expect(cached).toHaveAttribute('data-active', 'false')
  await expect(content(page, document).locator('.pm-section')).toHaveCount(0)
  await expect.poll(() => content(page, document).locator('html').evaluate(() => window.name)).toMatch(/:paused$/)
}

test.describe('the bounded workbench preview pool', () => {
  test.describe.configure({ mode: 'serial', timeout: 180_000 })
  test.use({ locale: 'zh-CN', viewport: { width: 1440, height: 900 }, actionTimeout: 30_000 })
  let studio: Studio
  let fixture: string

  test.beforeAll(async () => {
    test.setTimeout(240_000)
    fixture = mkdtempSync(join(tmpdir(), 'presmium-preview-cache-fixture-'))
    cpSync(fileURLToPath(new URL('./fixtures/workbench/workspace', import.meta.url)), fixture, { recursive: true })
    cpSync(fileURLToPath(new URL('./fixtures/preview-cache/lectures/third', import.meta.url)), join(fixture, THIRD), { recursive: true })
    cpSync(fileURLToPath(new URL('./fixtures/preview-cache/lectures/fourth', import.meta.url)), join(fixture, FOURTH), { recursive: true })
    studio = await startStudio({ port: await freePort(), prefix: 'preview-cache', fixture, isolateClient: true })
  })

  test.afterAll(async () => {
    await studio?.close()
    if (fixture) rmSync(fixture, { recursive: true, force: true })
  })

  test('reuses loaded windows, suspends inactive content, refreshes hidden edits and evicts old lectures', async ({ page }) => {
    const errors: string[] = []
    const controls = new Map<Request, string>()
    const snapshots: number[] = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('request', request => {
      const url = new URL(request.url())
      if (request.method() === 'GET' && url.pathname === '/__presmium/presmium.server/control') {
        controls.set(request, url.searchParams.get('document') ?? '')
      }
    })
    page.on('requestfinished', request => controls.delete(request))
    page.on('requestfailed', request => controls.delete(request))
    page.on('response', response => {
      if (new URL(response.url()).pathname.endsWith('/@lincyaw/ir')) snapshots.push(response.status())
    })

    await studio.open(page)
    await expect(page.locator('.pmw-home__card')).toHaveCount(4)
    await choose(page, INTRO)
    await ready(page, INTRO)
    await expect.poll(() => [...controls.values()]).toContain(INTRO)
    const originalFrame = await frame(page, INTRO).elementHandle()
    if (!originalFrame) throw new Error('the first lecture iframe did not mount')
    const originalPage = await originalFrame.contentFrame()
    if (!originalPage) throw new Error('the first lecture iframe has no browsing context')
    const marker = randomUUID()
    await originalFrame.evaluate((node, value) => node.dataset.testIdentity = value, marker)
    await originalPage.evaluate((value) => {
      (window as typeof window & { __presmiumPreviewCacheTest?: string }).__presmiumPreviewCacheTest = value
    }, marker)

    await home(page)
    await choose(page, SECOND)
    await ready(page, SECOND)
    await paused(page, INTRO)
    // Observe the real EventSource requests; an inactive lecture must close its control stream.
    await expect.poll(() => [...controls.values()]).not.toContain(INTRO)
    await expect.poll(() => [...controls.values()]).toContain(SECOND)

    const reloadedScripts: string[] = []
    const scripts = (request: Request) => {
      if (request.resourceType() === 'script' && request.frame() === originalPage) reloadedScripts.push(request.url())
    }
    page.on('request', scripts)
    const beforeReturn = snapshots.length
    await home(page)
    await choose(page, INTRO)
    await ready(page, INTRO)
    page.off('request', scripts)
    expect(await originalFrame.evaluate(node => node.isConnected)).toBe(true)
    await expect(frame(page, INTRO)).toHaveAttribute('data-test-identity', marker)
    expect(await originalPage.evaluate(() => (window as typeof window & { __presmiumPreviewCacheTest?: string }).__presmiumPreviewCacheTest)).toBe(marker)
    expect(reloadedScripts).toEqual([])
    expect(snapshots.slice(beforeReturn)).toContain(304)

    await home(page)
    await choose(page, SECOND)
    await ready(page, SECOND)
    await paused(page, INTRO)
    const path = join(studio.workspace.dir, INTRO, 'lecture.md')
    const changed = '缓存期间的新文字 capybara'
    writeFileSync(path, readFileSync(path, 'utf8').replace('alpha', changed))
    await expect.poll(async () => {
      const response = await page.request.get(`${studio.web.url}/api/presmium/ir?document=${encodeURIComponent(INTRO)}`)
      return response.ok() && (await response.text()).includes(changed)
    }).toBe(true)
    await paused(page, INTRO)
    await home(page)
    await choose(page, INTRO)
    await ready(page, INTRO)
    await expect(content(page, INTRO).locator('body')).toContainText(changed)
    expect(await originalPage.evaluate(() => (window as typeof window & { __presmiumPreviewCacheTest?: string }).__presmiumPreviewCacheTest)).toBe(marker)

    await home(page)
    await choose(page, THIRD)
    await ready(page, THIRD)
    await expect(content(page, THIRD).locator('html')).toHaveAttribute('data-preview-cache-legacy-plugin', 'started')
    await expect(page.locator('iframe[data-preview-cache]')).toHaveCount(2)
    await expect(frame(page, SECOND)).toHaveCount(0)
    await paused(page, INTRO)

    // This real plugin does not opt into restartability, so its iframe must be destroyed.
    await home(page)
    await expect(frame(page, THIRD)).toHaveCount(0)
    expect(await originalFrame.evaluate(node => node.isConnected)).toBe(true)
    // A viewer-only package must not bypass admission simply by having no kernel plugins.
    await choose(page, FOURTH)
    await ready(page, FOURTH)
    await expect(content(page, FOURTH).locator('html')).toHaveAttribute('data-preview-cache-legacy-viewer', 'installed')
    await home(page)
    await expect(frame(page, FOURTH)).toHaveCount(0)
    await choose(page, INTRO)
    await ready(page, INTRO)
    expect(await originalPage.evaluate(() => (window as typeof window & { __presmiumPreviewCacheTest?: string }).__presmiumPreviewCacheTest)).toBe(marker)

    // Do not wait for A to become ready: a newer selection must win over its pending resume.
    await home(page)
    await choose(page, INTRO)
    await home(page)
    await choose(page, SECOND)
    await ready(page, SECOND)
    await expect(page.locator('iframe[data-preview-cache][data-active="true"]')).toHaveCount(1)
    await expect(frame(page, SECOND)).toHaveAttribute('title', 'Second lecture')
    await expect(content(page, SECOND).locator('body')).toContainText('The second document of the workspace.')
    expect(await page.locator('iframe[data-preview-cache]').count()).toBeLessThanOrEqual(2)
    for (const cached of await page.locator('iframe[data-preview-cache][data-active="false"]').all()) {
      await expect(cached).toBeHidden()
      const document = await cached.getAttribute('data-document')
      if (document) await paused(page, document)
    }
    expect(errors).toEqual([])
  })
})
