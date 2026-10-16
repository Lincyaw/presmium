import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { useFixture } from './fixtures/deck.ts'

// e2e/fixtures/exec-wasi, built by `presmium build --to web` (WP-74, P-103): a C program that the
// build records on the WASI binaries in Node, and that the page compiles with the same clang and
// runs in a worker. The runtime files are published with the build, and the web form's service
// worker precaches them, so a page loaded once runs the program offline. The deck's plugin is
// linked in, since the demo does not depend on it. The first run downloads clang (some 50 MB).
test.describe.configure({ mode: 'default' })
const deck = useFixture('exec-wasi', { to: 'web', link: { '@presmium/slidev-addon-exec-wasi': 'packages/addon-exec-wasi' } })
const RUNTIME = { timeout: 120_000 }

/** The C program's block, once it can run. */
async function program(page: Page): Promise<Locator> {
  const block = page.locator('.pm-block[data-block="sum"]')
  await expect(block.locator('.pm-code-block__run button').first()).toBeEnabled()
  return block
}

/** Runs the block in the browser and resolves with what the program printed. */
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
  expect(await run(block)).toBe(recorded)

  // Offline once the service worker has precached the build, the HTTP cache cleared: the page and
  // the runtime come from the service worker, and a fresh worker compiles and runs the program.
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined))
  await context.setOffline(true)
  await (await context.newCDPSession(page)).send('Network.clearBrowserCache')
  expect((await page.reload())?.fromServiceWorker()).toBe(true)
  expect(await run(await program(page))).toBe(recorded)
})
