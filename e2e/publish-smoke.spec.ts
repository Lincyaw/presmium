import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { lowContrast } from './fixtures/contrast.ts'
import { deckDir, presmium, serve } from './fixtures/deck.ts'

test.describe.configure({ mode: 'default' })

let dir: string | undefined
let site: Awaited<ReturnType<typeof serve>> | undefined

test.beforeAll(async () => {
  test.setTimeout(180_000)
  dir = deckDir('publish-smoke', { '@lincyaw/addon-publish': 'packages/addon-publish' })
  cpSync(new URL('./fixtures/publish-smoke', import.meta.url), dir, { recursive: true })
  const image = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="40" height="20" fill="#175cd3"/></svg>'
  const origin = createServer((_, response) => response.writeHead(200, { 'Content-Type': 'image/svg+xml' }).end(image))
  await new Promise<void>(resolve => origin.listen(0, '127.0.0.1', resolve))
  try {
    const remote = `http://127.0.0.1:${(origin.address() as { port: number }).port}/image.svg`
    const lecture = join(dir, 'lecture.md')
    writeFileSync(lecture, readFileSync(lecture, 'utf8').replace('__REMOTE_IMAGE__', remote))
    await presmium(['build', '--to', 'web'], dir)
  } finally {
    await new Promise<void>(resolve => {
      origin.close(() => resolve())
      origin.closeAllConnections()
    })
  }
  site = await serve(join(dir, 'dist/web'))
})

test.afterAll(async () => {
  await site?.close()
  if (dir) rmSync(dir, { recursive: true, force: true })
})

test('high contrast remains enabled after reload and its reading text meets AA', async ({ page }) => {
  await page.goto(site!.url, { waitUntil: 'domcontentloaded' })
  const reading = page.locator('.pm-section[data-section="reading"]')
  const toggle = reading.getByRole('switch', { name: '高对比度' })
  await expect(toggle).toHaveAttribute('aria-checked', 'false')
  await toggle.click()
  await expect(page.locator('html')).toHaveAttribute('data-pm-contrast', 'high')
  expect(await lowContrast(page, '.pm-section[data-section="reading"]')).toEqual([])
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(toggle).toHaveAttribute('aria-checked', 'true')
  await expect(page.locator('html')).toHaveAttribute('data-pm-contrast', 'high')
  expect(await lowContrast(page, '.pm-section[data-section="reading"]')).toEqual([])
})

test('the web page and its downloaded image reload offline, then a local link still opens', async ({ page, context }) => {
  await page.goto(site!.url, { waitUntil: 'domcontentloaded' })
  const loaded = () => page.getByRole('img', { name: '远端示例图' }).evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)
  await expect.poll(loaded).toBe(true)
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  const cdp = await context.newCDPSession(page)
  await cdp.send('Network.clearBrowserCache')
  await cdp.detach()
  const response = await page.reload({ waitUntil: 'domcontentloaded' })
  expect(response?.fromServiceWorker()).toBe(true)
  await expect(page.locator('main').getByRole('heading', { name: '阅读与对比度' })).toBeVisible()
  await expect.poll(loaded).toBe(true)
  await page.getByRole('link', { name: '继续阅读', exact: true }).click()
  await expect(page.locator('main').getByRole('heading', { name: '离线第二页' })).toBeVisible()
})
