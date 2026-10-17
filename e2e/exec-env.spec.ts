import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { openSlide, useFixture } from './fixtures/deck.ts'

// e2e/fixtures/exec-env, built by `presmium build` (WP-73b): named environments (P-100), execution
// sessions (P-101) and rich outputs (P-102). Its environment `lab` has a compile-time executor only
// (the test plugin ./lab), so in the browser no executor runs it. Loading the Python runtime takes a
// few seconds, hence the longer waits for first results.
test.describe.configure({ mode: 'default' })
const deck = useFixture('exec-env')
const RUNTIME = { timeout: 60_000 }

/** Opens the web page of a section and waits until the code of `block` can run. */
async function openSection(page: Page, section: string, block: string) {
  await page.goto(`${deck().web}/?section=${section}`)
  const code = page.locator(`.pm-block[data-block="${block}"]`)
  await expect(code.locator('.pm-code-block__run button').first()).toBeEnabled()
  return code
}

/** Runs `block`; a new page's first run loads the Python runtime first. */
async function run(page: Page, block: string) {
  const code = page.locator(`.pm-block[data-block="${block}"]`)
  await code.locator('.pm-code-block__run button').first().click()
  await expect(code.locator('.pm-outputs')).toHaveAttribute('data-source', /live|recorded/, RUNTIME)
  return code
}

test('code that names an environment no browser executor runs fails, and shows its recorded output and why; Pyodide does not run it', async ({ page }) => {
  const pyodide: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/pyodide/')) pyodide.push(request.url())
  })
  const code = await openSection(page, 'env-missing', 'in-lab')
  await code.locator('.pm-code-block__run button').first().click()
  await expect(code.locator('.pm-output__note')).toContainText('presmium.env.lab')
  await expect(code.locator('.pm-outputs')).toHaveAttribute('data-source', 'recorded')
  await expect(code.locator('.pm-output')).toHaveAttribute('data-executor', 'presmium.env.lab')
  await expect(code.locator('.pm-output__stdout')).toHaveText('实验环境中录制的输出\n')
  expect(pyodide).toEqual([])
})

test('blocks of a session share the interpreter of their page; a reset, another page and another learner start afresh', async ({ page, browser }) => {
  test.setTimeout(240_000)
  await openSection(page, 'session', 'use')
  await run(page, 'define')
  await expect(page.locator('[data-block="define"] .pm-output__stdout')).toHaveText('定义了 x\n', RUNTIME)
  const use = await run(page, 'use')
  await expect(use.locator('.pm-output__stdout')).toHaveText('42\n', RUNTIME)

  // Reset drops the session's state.
  await use.locator('.pm-code-block__reset').click()
  await run(page, 'use')
  await expect(use.locator('.pm-output__error')).toContainText('NameError', RUNTIME)

  // Another page of the same browser context has a session of its own.
  await run(page, 'define')
  await expect(page.locator('[data-block="define"] .pm-output__stdout')).toHaveText('定义了 x\n', RUNTIME)
  const other = await page.context().newPage()
  await openSection(other, 'session', 'use')
  await expect((await run(other, 'use')).locator('.pm-output__error')).toContainText('NameError', RUNTIME)

  // So has another learner (another browser context).
  const learner = await browser.newContext()
  const third = await learner.newPage()
  await openSection(third, 'session', 'use')
  await expect((await run(third, 'use')).locator('.pm-output__error')).toContainText('NameError', RUNTIME)
  await learner.close()

  // The first page's session still holds x.
  await expect((await run(page, 'use')).locator('.pm-output__stdout')).toHaveText('42\n', RUNTIME)
})

test('an image the code displays shows as an image in the web form and the slides', async ({ page }) => {
  await page.goto(`${deck().web}/?section=image`)
  const image = page.locator('.pm-block[data-block="png"] .pm-output img')
  await expect(image).toHaveAttribute('src', /^data:image\/png;base64,/)
  await expect.poll(() => image.evaluate(img => (img as HTMLImageElement).naturalWidth)).toBe(8)

  const slide = await openSlide(page, deck(), 'image', '图片输出')
  await expect(slide.locator('img.pm-output__image')).toHaveAttribute('src', /^data:image\/png;base64,/)
})

test('a Markdown table that hidden code prints shows as a table of the page, without the code', async ({ page }) => {
  await page.goto(`${deck().web}/?section=table`)
  const block = page.locator('.pm-block[data-block="counts"]')
  await expect(block.locator('table tbody tr')).toHaveCount(2)
  await expect(block.locator('table')).toContainText('你好')
  await expect(block.locator('.pm-code, .pm-code-block__run')).toHaveCount(0)
  await expect(block.locator('.pm-outputs')).toHaveClass(/pm-outputs--prose/)
})

test('in the slides, Python code with :run: live runs in the Monaco Runner and shows its output', async ({ page }) => {
  const slide = await openSlide(page, deck(), 'slides-live', '幻灯片中的现场代码')
  // Code with :run: live has no recording: until it runs, the runner says how to run it.
  await expect(slide.locator('.slidev-runner-output .pm-run-hint')).toHaveText('按 ▶ 运行这段代码')
  await slide.getByRole('button', { name: 'Run code' }).click()
  await expect(slide.locator('.slidev-runner-output')).toHaveText('45', RUNTIME)
})
