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

test('in the slides, the C program runs live in its Monaco runner; the runtimes\' licenses are published with both forms', async ({ page }) => {
  test.setTimeout(300_000)
  const slide = await openSlide(page, deck(), 'c-program', 'C 程序')
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
