import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import type { IRDocument } from '../packages/kernel/src/ir.ts'
import { SLIDES, WEB } from './urls.ts'

// The demo lecture's chapter "延伸" (examples/demo/pages/extend.md, WP-89a) in its build
// (`pnpm demo:build`, served on WEB and SLIDES): it opens in the web form and the slides; the C
// program, recorded at build time in WebAssembly, runs in the browser with the same output; the
// compute shader, recorded at build time on the GPU, finds the same pair on a WebGPU adapter in the
// browser (SwiftShader, so that any machine has one), and its slide shows it whole; the predict shows
// its answer once the reader has saved a choice; the table that the Python session wrote and the cards show.
const RUNTIME = { timeout: 120_000 }

async function irDocument(page: Page): Promise<IRDocument> {
  return await (await page.request.get(`${WEB}/ir.json`)).json() as IRDocument
}

test('the chapter opens in the web form: the table its session wrote, the predict\'s answer once a choice is saved, the cards', async ({ page }) => {
  const doc = await irDocument(page)
  const chapter = doc.sections.filter(s => s.id.startsWith('extend'))
  expect(chapter.map(s => s.id)).toEqual(['extend', 'extend-c', 'extend-gpu', 'extend-train', 'extend-predict', 'extend-encode', 'extend-reading'])
  await page.goto(`${WEB}/extend.html`)
  for (const section of chapter) await expect(page.locator(`.pm-section[data-section="${section.id}"]`)).toContainText(section.title)

  // Written by a code block of the session that shows its output only.
  const table = page.locator('.pm-block[data-block="merges-table"]')
  await expect(table.locator('tbody tr')).toHaveCount(10)
  await expect(table.locator('tbody tr').last()).toContainText("'newest newest '")
  await expect(table.locator('code', { hasText: 'display(' })).toHaveCount(0)
  await expect(page.locator('.pm-block[data-block="encode-words"] .pm-output__stdout')).toHaveText("lowest ['low', 'est'] [260, 257]\nnewer ['new', 'e', 'r'] [263, 101, 114]\n")

  const predict = page.locator('.pm-predict')
  const answer = page.getByText("合并成新词元 ' low low'，编号 266")
  await expect(answer).toBeHidden()
  await predict.getByRole('radio', { name: "' low' 和 ' low'" }).check()
  await predict.getByRole('button', { name: '保存预测' }).click()
  await expect(answer).toBeVisible()

  const cards = page.locator('.pm-section[data-section="extend-reading"] .pm-grid > .pm-card')
  await expect(cards).toHaveCount(4)
  await expect(cards.first().locator('.pm-card__title a')).toHaveAttribute('href', 'https://github.com/karpathy/minbpe')
})

test('the chapter opens in the slides, the C program with the output recorded at build time', async ({ page }) => {
  const doc = await irDocument(page)
  for (const id of ['extend', 'extend-c']) {
    const section = doc.sections.find(s => s.id === id)!
    await page.goto(`${SLIDES}/${section.index}`)
    await expect(page.locator(`.slidev-page-${section.index} h1`)).toHaveText(section.title)
  }
  const index = doc.sections.find(s => s.id === 'extend-c')!.index
  // The runner shows the build's recording in its own output (WP-89e, F-18).
  await expect(page.locator(`.slidev-page-${index} .slidev-runner-output`)).toContainText('次数最多的一对 (97, 97) 就是 a a')
})

test('on its slide the compute shader stays legible, its run panel on the slide and the code scrolling (C-8, R-27)', async ({ page }) => {
  // The run panel fills what is left of the slide (WP-89e, F-19). The acceptor chose R-27 over showing the
  // whole shader: the code keeps a projection size (18 px or more) and scrolls in its panel.
  const doc = await irDocument(page)
  const { index } = doc.sections.find(s => s.id === 'extend-gpu')!
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto(`${SLIDES}/${index}`)
  const slide = page.locator(`.slidev-page-${index}`)
  const code = slide.locator('.pm-run-panel__source pre').first()
  await expect(code).toBeVisible()
  await expect(code).toContainText('best[2] = counts[top];')
  expect(await code.evaluate(el => Number.parseFloat(getComputedStyle(el).fontSize) * (el.getBoundingClientRect().height / el.offsetHeight))).toBeGreaterThanOrEqual(18)
  const bottom = (await slide.boundingBox())!
  const run = (await slide.locator('.pm-run-panel__run').first().boundingBox())!
  expect(run.y + run.height).toBeLessThanOrEqual(bottom.y + bottom.height)
})

test('on their slides the C program and the training code keep a projection size with no zoom, their editor scrolling and the output on the slide (R-27)', async ({ page }) => {
  const doc = await irDocument(page)
  await page.setViewportSize({ width: 1920, height: 1080 })
  for (const [id, last] of [['extend-c', 'return 0;'], ['extend-train', '个词元']] as const) {
    const { index } = doc.sections.find(s => s.id === id)!
    await page.goto(`${SLIDES}/${index}`)
    const slide = page.locator(`.slidev-page-${index}`)
    const editor = slide.locator('.slidev-monaco-container-inner').first()
    await expect(slide.locator('.view-lines').first()).toBeVisible()
    // The code's size on the screen: its font size, scaled with the slide.
    const size = await slide.locator('.view-lines').first().evaluate((el: HTMLElement) => Number.parseFloat(getComputedStyle(el).fontSize) * el.getBoundingClientRect().height / el.offsetHeight)
    expect(size, id).toBeGreaterThanOrEqual(18)
    // The output, below the editor, is on the slide; the editor, shorter than the code, scrolls to its last line.
    const output = slide.locator('.slidev-runner-output').first()
    await expect(output).toBeVisible()
    const [frame, below] = [(await slide.boundingBox())!, (await output.boundingBox())!]
    expect(below.y + below.height, id).toBeLessThanOrEqual(frame.y + frame.height + 1)
    await editor.hover()
    await expect(async () => {
      await page.mouse.wheel(0, 2000)
      await expect(slide.locator('.view-lines').first()).toContainText(last, { timeout: 1_000 })
    }).toPass({ timeout: 20_000 })
  }
})

test('the C program runs in the browser and prints what the build recorded', async ({ page }) => {
  test.setTimeout(300_000)
  await page.goto(`${WEB}/extend.html`)
  const block = page.locator('.pm-block[data-block="c-pairs"]')
  const run = block.locator('.pm-code-block__run button').first()
  await expect(run).toBeEnabled()
  await expect(block.locator('.pm-outputs')).toHaveAttribute('data-source', 'recorded')
  const recorded = await block.locator('.pm-output__stdout').textContent()
  expect(recorded).toBe('(97, 97): 4\n(97, 98): 2\n(97, 99): 1\n(98, 97): 1\n(98, 100): 1\n(100, 97): 1\n次数最多的一对 (97, 97) 就是 a a\n')
  // The first run downloads the C compiler (some 50 MB) from the build.
  await run.click()
  await expect(block.locator('.pm-outputs')).toHaveAttribute('data-source', 'live', RUNTIME)
  await expect(block.locator('.pm-output')).toHaveAttribute('data-executor', 'presmium.wasi')
  expect(await block.locator('.pm-output__stdout').textContent()).toBe(recorded)
})

test('on a WebGPU adapter, the compute shader finds the pair the build recorded on the GPU', async ({ playwright, page }) => {
  const doc = await irDocument(page)
  const block = doc.sections.flatMap(s => s.blocks).find(b => b.id === 'gpu-pairs')!
  const recorded = String((block.node as unknown as { props: { compiledOutput: string } }).props.compiledOutput)
  expect(recorded.split('\n')[0]).toBe('best: u32[3] = [97, 97, 4]')

  // Chromium with SwiftShader, a WebGPU adapter on any machine (the default headless one has none).
  const browser = await playwright.chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-unsafe-swiftshader'] })
  try {
    const gpuPage = await browser.newPage()
    await gpuPage.goto(`${WEB}/extend.html`)
    const panel = gpuPage.locator('.pm-block[data-block="gpu-pairs"] .pm-run-panel')
    await panel.locator('.pm-run-panel__run').click()
    const output = panel.locator('.pm-run-panel__output')
    await expect(output).toHaveAttribute('data-source', 'live', RUNTIME)
    await expect(output).toHaveAttribute('data-ok', 'true')
    const stdout = await output.locator('.pm-run-panel__stdout').textContent() ?? ''
    expect(stdout.split('\n')[0]).toBe(recorded.split('\n')[0])
    expect(stdout).toContain('CPU 模拟')
  } finally {
    await browser.close()
  }
})
