import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { SLIDES } from './urls.ts'

// The slides of examples/demo/pages/exec.md are reached by their route aliases and
// located by their headings, since Slidev keeps preloaded slides in the DOM too.
// Loading the Python runtime takes a few seconds, hence the longer waits for first results.
const RUNTIME = { timeout: 30_000 }

async function openSlide(page: Page, alias: string, heading: string) {
  await page.goto(`${SLIDES}/${alias}`)
  const slide = page.locator('.slidev-page').filter({ has: page.locator('h1', { hasText: heading }) })
  await expect(slide).toBeVisible()
  return slide
}

async function openPanel(page: Page, alias: string, heading: string) {
  const panel = (await openSlide(page, alias, heading)).locator('.pm-run-panel')
  await expect(panel.locator('.pm-run-panel__run')).toBeEnabled()
  return panel
}

test('Python code runs in the browser and shows its output', async ({ page }) => {
  const slide = await openSlide(page, 'exec-monaco', '浏览器内运行 Python')
  const output = slide.locator('.slidev-runner-output')
  await expect(output).toContainText('1 + 2 + … + 100 = 5050', RUNTIME)
  await expect(output).toContainText('在浏览器中运行')
})

test('rerunning with a changed parameter shows the difference between the runs', async ({ page }) => {
  const panel = await openPanel(page, 'exec-panel', '执行面板')
  await panel.locator('.pm-run-panel__run').click()
  await expect(panel.locator('.pm-run-panel__stdout')).toHaveText('1 1\n2 1\n3 2\n4 3\n5 5\n', RUNTIME)
  await expect(panel.locator('.pm-run-panel__compare')).toHaveCount(0)

  await panel.locator('input[name="n"]').fill('7')
  await panel.locator('.pm-run-panel__run').click()
  await expect(panel).toHaveAttribute('data-runs', '2')
  const compare = panel.locator('.pm-run-panel__compare')
  await expect(compare.locator('[data-arg="n"]')).toContainText('5 → 7')
  await expect(compare.locator('[data-kind="added"]')).toHaveText(['+ 6 8', '+ 7 13'])
  await expect(compare.locator('[data-kind="removed"]')).toHaveCount(0)
})

test('stepping back returns the output to the previous step', async ({ page }) => {
  const run = (await openSlide(page, 'exec-steps', '分步执行')).locator('.pm-step-run')
  await expect(run).toHaveAttribute('data-state', 'ready', RUNTIME)
  await expect(run).toHaveAttribute('data-steps', '12')
  const output = run.locator('.pm-step-run__output')
  const highlighted = run.locator('.pm-step-run__line')

  for (let step = 1; step <= 7; step++) {
    await page.keyboard.press('ArrowRight')
    await expect(run).toHaveAttribute('data-step', String(step))
  }
  // Executed lines: 1, 2, 3, 4, 2, 3, 4, ... so step 7 runs the print (line 4) for the second time.
  await expect(run).toHaveAttribute('data-line', '4')
  await expect(highlighted).toHaveText('    print(f"n={n} total={total}")')
  await expect(output).toHaveText('n=1 total=1\nn=2 total=3\n')

  await page.keyboard.press('ArrowLeft')
  await expect(run).toHaveAttribute('data-step', '6')
  await expect(run).toHaveAttribute('data-line', '3')
  await expect(highlighted).toHaveText('    total += n')
  await expect(output).toHaveText('n=1 total=1\n')
})

test('a run that times out shows the recorded output, marked as recorded', async ({ page }) => {
  const panel = await openPanel(page, 'exec-fallback', '预录输出回退')
  await panel.locator('.pm-run-panel__run').click()
  const output = panel.locator('.pm-run-panel__output')
  await expect(output).toHaveAttribute('data-source', 'recorded', RUNTIME)
  await expect(output.locator('.pm-run-panel__badge')).toHaveText('预录输出 · 执行超时')
  await expect(output.locator('.pm-run-panel__stdout')).toHaveText('x = 1.4142135623730951（√2，预先录制）')
})
