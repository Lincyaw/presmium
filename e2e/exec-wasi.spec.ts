import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { openSlide, useFixture } from './fixtures/deck.ts'

// e2e/fixtures/exec-wasi, built by `presmium build` (WP-74, P-103): a C program that the build
// records on the WASI binaries in Node, and that the page compiles with the same clang and runs in
// a worker. The runtime files are published with each form, with their licenses, and the web
// form's service worker precaches them, so a page loaded once runs the program offline. In the
// slides the program runs in Slidev's Monaco runner (WP-79e2). The deck's plugin is linked in,
// since the demo does not depend on it. The first run downloads clang (some 50 MB).
test.describe.configure({ mode: 'default' })
const deck = useFixture('exec-wasi', { to: 'web,slides', link: { '@presmium/slidev-addon-exec-wasi': 'packages/addon-exec-wasi' } })
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

test('in the slides, the C program runs live in its Monaco runner; the runtimes\' licenses are published with both forms', async ({ page }) => {
  test.setTimeout(300_000)
  const slide = await openSlide(page, deck(), 'c-program', 'C 程序')
  // The runner's output area shows the output recorded at compile time until the code runs.
  const output = slide.locator('.slidev-runner-output')
  await expect(output.locator('.pm-run-recorded')).toHaveText('预录输出')
  await expect(output).toContainText('1 + 2 + ... + 100 = 5050')
  await expect(slide.locator('.pm-output')).toHaveCount(0)
  await slide.getByRole('button', { name: 'Run code' }).click()
  await expect(output).toHaveText('1 + 2 + ... + 100 = 5050', RUNTIME)

  for (const form of [deck().slides, deck().web]) {
    const licenses = await page.request.get(`${form}/wasi/LICENSES`)
    expect(licenses.status()).toBe(200)
    expect(await licenses.text()).toContain('clang.wasm, wasm-ld.wasm, clang-fs.tar.gz')
  }
})
