import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { openSlide, useFixture } from './fixtures/deck.ts'

test.describe.configure({ mode: 'default' })
const deck = useFixture('exec-wasi', { to: 'web,slides', link: { '@lincyaw/addon-exec-wasi': 'packages/addon-exec-wasi' } })
const RUNTIME = { timeout: 120_000 }

async function program(page: Page): Promise<Locator> {
  const block = page.locator('.pm-block[data-block="sum"]')
  await expect(block.locator('.pm-code-block__run button').first()).toBeEnabled()
  return block
}

async function run(block: Locator): Promise<string> {
  await block.locator('.pm-code-block__run button').first().click()
  await expect(block.locator('.pm-outputs')).toHaveAttribute('data-source', 'live', RUNTIME)
  await expect(block.locator('.pm-output')).toHaveAttribute('data-executor', 'presmium.wasi')
  return await block.locator('.pm-output__stdout').textContent() ?? ''
}

test('a C program runs in the browser with the output recorded at compile time, and again offline once the page has loaded', async ({ page, context }) => {
  test.setTimeout(300_000)
  await page.goto(`${deck().web}/?section=c-program`)
  const block = await program(page)
  await expect(block.locator('.pm-outputs')).toHaveAttribute('data-source', 'recorded')
  const recorded = await block.locator('.pm-output__stdout').textContent()
  expect(recorded).toBe('1 + 2 + ... + 100 = 5050\n')
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  expect(await run(block)).toBe(recorded)

  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined))
  await context.setOffline(true)
  await (await context.newCDPSession(page)).send('Network.clearBrowserCache')
  expect((await page.reload())?.fromServiceWorker()).toBe(true)
  expect(await run(await program(page))).toBe(recorded)
})
