import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { useFixture } from './fixtures/deck.ts'

test.describe.configure({ mode: 'default' })
const deck = useFixture('exec-webgpu', {
  to: 'web,slides',
  link: { '@lincyaw/addon-exec-webgpu': 'packages/addon-exec-webgpu' },
  edit(dir) {
    // This bounded smoke checks the shader; the dedicated suite covers Python and jax-js.
    const file = join(dir, 'lecture.md')
    writeFileSync(file, readFileSync(file, 'utf8').split('\n(python)=')[0]! + '\n')
  },
})
test.use({ launchOptions: { args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-unsafe-swiftshader'] } })
const SUM = 'out: f32[4] = [11, 22, 33, 44]'

test('a browser with WebGPU disabled shows the recorded shader result and an explicit unavailable reason', async ({ playwright }) => {
  const browser = await playwright.chromium.launch({ args: ['--disable-gpu', '--disable-features=WebGPU'] })
  try {
    const page = await browser.newPage()
    await page.goto(`${deck().web}/?section=shader`)
    const available = await page.evaluate(async () => Boolean(await (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu?.requestAdapter()))
    expect(available).toBe(false)
    const panel = page.locator('.pm-block[data-block="add"] .pm-run-panel')
    await panel.locator('.pm-run-panel__run').click()
    await expect(panel.locator('.pm-run-panel__output')).toHaveAttribute('data-source', 'recorded', { timeout: 60_000 })
    await expect(panel.locator('.pm-run-panel__badge')).toHaveText('预录输出 · 没有可用的 GPU 适配器')
    await expect(panel.locator('.pm-run-panel__stdout')).toContainText(SUM)
  } finally {
    await browser.close()
  }
})
