import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { openSlide, useFixture } from './fixtures/deck.ts'

// e2e/fixtures/exec-webgpu, built by `presmium build` (WP-75, P-104): a WGSL compute shader in a run
// panel, recorded at build time in Playwright's Chromium; the same shader from Python through
// `presmium_gpu`; and jax-js in JavaScript. Chromium runs with SwiftShader (docs/architecture.md
// section 7), so the GPU is a fallback adapter and timings are CPU emulation; one test starts the
// default headless Chromium, which has no GPU adapter, to see the recorded output and the reason.
test.describe.configure({ mode: 'default' })
const deck = useFixture('exec-webgpu', { link: { '@presmium/slidev-addon-exec-webgpu': 'packages/addon-exec-webgpu' } })
test.use({ launchOptions: { args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-unsafe-swiftshader'] } })
const RUNTIME = { timeout: 60_000 }
const SUM = 'out: f32[4] = [11, 22, 33, 44]'

async function webBlock(page: Page, section: string, block: string): Promise<Locator> {
  await page.goto(`${deck().web}/?section=${section}`)
  return page.locator(`.pm-block[data-block="${block}"]`)
}

/** Runs the code block and resolves with its output, once the run has ended. */
async function runCode(code: Locator): Promise<Locator> {
  await expect(code.locator('.pm-code-block__run button').first()).toBeEnabled()
  await code.locator('.pm-code-block__run button').first().click()
  await expect(code.locator('.pm-outputs')).toHaveAttribute('data-source', 'live', RUNTIME)
  return code.locator('.pm-output')
}

test('a compute shader runs in the browser and shows the sum and its timing, marked as CPU emulation, in both forms', async ({ page }) => {
  const panel = (await webBlock(page, 'shader', 'add')).locator('.pm-run-panel')
  await panel.locator('.pm-run-panel__run').click()
  const output = panel.locator('.pm-run-panel__output')
  await expect(output).toHaveAttribute('data-source', 'live', RUNTIME)
  await expect(output).toHaveAttribute('data-ok', 'true')
  const stdout = output.locator('.pm-run-panel__stdout')
  await expect(stdout).toContainText(SUM)
  await expect(stdout).toContainText(/计时：每次派发 [\d.e-]+ ms（5 次的中位数；GPU 时间戳；CPU 模拟）/)
  await expect(stdout).toContainText('适配器：google swiftshader（回退适配器）')

  const slide = (await openSlide(page, deck(), 'shader', '向量加法')).locator('.pm-run-panel')
  await slide.locator('.pm-run-panel__run').click()
  await expect(slide.locator('.pm-run-panel__output')).toHaveAttribute('data-source', 'live', RUNTIME)
  await expect(slide.locator('.pm-run-panel__stdout')).toContainText(SUM)
  await expect(slide.locator('.pm-run-panel__stdout')).toContainText('CPU 模拟')
})

test('Python runs the same shader through presmium_gpu, with await and, having JSPI, without', async ({ page }) => {
  test.setTimeout(180_000)
  const awaited = await runCode(await webBlock(page, 'python', 'py-async'))
  await expect(awaited.locator('.pm-output__stdout')).toContainText(SUM, RUNTIME)
  await expect(awaited.locator('.pm-output__stdout')).toContainText('CPU emulation')

  const synchronous = await runCode(page.locator('.pm-block[data-block="py-sync"]'))
  await expect(synchronous.locator('.pm-output__stdout')).toHaveText('JSPI: True\n[11.0, 22.0, 33.0, 44.0]\n', RUNTIME)
})

test('JavaScript multiplies 2×2 matrices with jax-js on WebGPU', async ({ page }) => {
  const output = await runCode(await webBlock(page, 'tensor', 'matmul'))
  await expect(output.locator('.pm-output__stdout')).toHaveText('webgpu [[19,22],[43,50]]\n', RUNTIME)
})

test('without a GPU adapter, the shader shows its recorded output and why', async ({ playwright }) => {
  // The default headless Chromium (without the SwiftShader flags of the other tests): WebGPU, but no adapter.
  const browser = await playwright.chromium.launch({ args: [] })
  try {
    const page = await browser.newPage()
    const panel = (await webBlock(page, 'shader', 'add')).locator('.pm-run-panel')
    await panel.locator('.pm-run-panel__run').click()
    const output = panel.locator('.pm-run-panel__output')
    await expect(output).toHaveAttribute('data-source', 'recorded', RUNTIME)
    await expect(output.locator('.pm-run-panel__badge')).toHaveText('预录输出 · 没有可用的 GPU 适配器')
    await expect(output.locator('.pm-run-panel__stdout')).toContainText(SUM)
    await expect(output.locator('.pm-run-panel__stdout')).toContainText(/^time: .* ms per dispatch/m)
  } finally {
    await browser.close()
  }
})
