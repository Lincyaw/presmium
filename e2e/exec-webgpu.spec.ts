import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { openSlide, useFixture } from './fixtures/deck.ts'

test.describe.configure({ mode: 'default' })
const deck = useFixture('exec-webgpu', { link: { '@presmium/slidev-addon-exec-webgpu': 'packages/addon-exec-webgpu' } })
test.use({ launchOptions: { args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-unsafe-swiftshader'] } })
const RUNTIME = { timeout: 60_000 }
const SUM = 'out: f32[4] = [11, 22, 33, 44]'

async function webBlock(page: Page, section: string, block: string): Promise<Locator> {
  await page.goto(`${deck().web}/?section=${section}`)
  return page.locator(`.pm-block[data-block="${block}"]`)
}

async function runCode(code: Locator): Promise<Locator> {
  await expect(code.locator('.pm-code-block__run button').first()).toBeEnabled()
  await code.locator('.pm-code-block__run button').first().click()
  await expect(code.locator('.pm-outputs')).toHaveAttribute('data-source', 'live', RUNTIME)
  return code.locator('.pm-output')
}

test('the panel names the shader\'s parameters for learners: a field per buffer, and its history sums the arguments up (D-10)', async ({ page }) => {
  const panel = (await webBlock(page, 'shader', 'add')).locator('.pm-run-panel')
  await expect(panel.locator('.pm-run-panel__run')).toBeEnabled()
  const labels = panel.locator('.pm-run-panel__param > span')
  await expect(labels).toHaveText(['缓冲区 a', '缓冲区 b', '缓冲区 out', '工作组数', '重复次数'])
  await expect(panel.locator('input[name="buffers.out"]')).toHaveValue('{"size":4}')
  await panel.locator('input[name="buffers.a"]').fill('[2, 3, 4, 5]')
  await panel.locator('.pm-run-panel__run').click()
  await expect(panel.locator('.pm-run-panel__output')).toHaveAttribute('data-source', 'live', RUNTIME)
  await expect(panel.locator('.pm-run-panel__stdout')).toContainText('out: f32[4] = [12, 23, 34, 45]')
  await expect(panel.locator('.pm-run-panel__history li')).toContainText(/#1 缓冲区 a: 4 个值, b: 4 个值, out: 4 个值 · 工作组数 1 · 重复次数 5 · 成功 · \d+ ms/)
})

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

test('Python runs the same shader through presmium_gpu, with await and, having JSPI, without, within the same scale limits', async ({ page }) => {
  test.setTimeout(180_000)
  const awaited = await runCode(await webBlock(page, 'python', 'py-async'))
  await expect(awaited.locator('.pm-output__stdout')).toContainText(SUM, RUNTIME)
  await expect(awaited.locator('.pm-output__stdout')).toContainText('CPU emulation')

  const synchronous = await runCode(page.locator('.pm-block[data-block="py-sync"]'))
  await expect(synchronous.locator('.pm-output__stdout')).toHaveText('JSPI: True\n[11.0, 22.0, 33.0, 44.0]\n', RUNTIME)

  const limits = await runCode(page.locator('.pm-block[data-block="py-limits"]'))
  await expect(limits.locator('.pm-output__stdout')).toHaveText('The buffers take 160000000 bytes, over the scale limit of 134217728 bytes\nrepeat is an integer from 1 to 1000\n', RUNTIME)
})

test('JavaScript multiplies 2×2 matrices with jax-js on WebGPU', async ({ page }) => {
  const output = await runCode(await webBlock(page, 'tensor', 'matmul'))
  await expect(output.locator('.pm-output__stdout')).toHaveText('webgpu [[19,22],[43,50]]\n', RUNTIME)
})

test('without a GPU adapter, the shader shows its recorded output and why', async ({ playwright }) => {
  const browser = await playwright.chromium.launch({ args: [] })
  try {
    const page = await browser.newPage()
    const panel = (await webBlock(page, 'shader', 'add')).locator('.pm-run-panel')
    await panel.locator('.pm-run-panel__run').click()
    const output = panel.locator('.pm-run-panel__output')
    await expect(output).toHaveAttribute('data-source', 'recorded', RUNTIME)
    await expect(output.locator('.pm-run-panel__badge')).toHaveText('预录输出 · 没有可用的 GPU 适配器')
    await expect(output.locator('.pm-run-panel__stdout')).toContainText(SUM)
    await expect(output.locator('.pm-run-panel__stdout')).toContainText(/^计时：每次派发 .* ms/m)

    const python = await webBlock(page, 'python', 'py-async')
    await python.locator('.pm-code-block__run button').first().click()
    await expect(python.locator('.pm-outputs')).toContainText('没有可用的 GPU 适配器', RUNTIME)
    await expect(python.locator('.pm-outputs')).not.toContainText('Traceback')
    await expect(python.locator('.pm-outputs')).not.toContainText('GPUUnavailable')
  } finally {
    await browser.close()
  }
})

const VULKAN = ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-angle=vulkan']

test('on the GPU that Chromium finds through Vulkan, the shader and jax-js run on it (P-104; skipped without one)', async ({ playwright }) => {
  test.setTimeout(180_000)
  const browser = await playwright.chromium.launch({ args: VULKAN })
  try {
    const page = await browser.newPage()
    await page.goto(`${deck().web}/?section=shader`)
    const adapter = await page.evaluate(async () => {
      const found = await (navigator as Navigator & { gpu?: { requestAdapter(): Promise<{ info: { vendor: string, isFallbackAdapter: boolean } } | null> } }).gpu?.requestAdapter()
      return found && !found.info.isFallbackAdapter ? found.info.vendor : undefined
    })
    test.skip(!adapter, 'Chromium finds no GPU through Vulkan (--enable-features=Vulkan): run it on a machine with a GPU and its Vulkan driver')
    const panel = page.locator('.pm-block[data-block="add"] .pm-run-panel')
    await panel.locator('.pm-run-panel__run').click()
    const stdout = panel.locator('.pm-run-panel__stdout')
    await expect(panel.locator('.pm-run-panel__output')).toHaveAttribute('data-source', 'live', RUNTIME)
    await expect(stdout).toContainText(SUM)
    await expect(stdout).toContainText(`适配器：${adapter}`)
    await expect(stdout).not.toContainText('CPU 模拟')

    await page.goto(`${deck().web}/?section=tensor`)
    const output = await runCode(page.locator('.pm-block[data-block="matmul"]'))
    await expect(output.locator('.pm-output__stdout')).toHaveText('webgpu [[19,22],[43,50]]\n', RUNTIME)
  } finally {
    await browser.close()
  }
})
