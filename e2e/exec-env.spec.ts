import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { useFixture } from './fixtures/deck.ts'

test.describe.configure({ mode: 'default' })
const deck = useFixture('exec-env')
const RUNTIME = { timeout: 60_000 }

async function openSection(page: Page, section: string, block: string) {
  await page.goto(`${deck().web}/?section=${section}`)
  const code = page.locator(`.pm-block[data-block="${block}"]`)
  await expect(code.locator('.pm-code-block__run button').first()).toBeEnabled()
  return code
}

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

  await use.locator('.pm-code-block__reset').click()
  await run(page, 'use')
  await expect(use.locator('.pm-output__error')).toContainText('NameError', RUNTIME)

  await run(page, 'define')
  await expect(page.locator('[data-block="define"] .pm-output__stdout')).toHaveText('定义了 x\n', RUNTIME)
  const other = await page.context().newPage()
  await openSection(other, 'session', 'use')
  await expect((await run(other, 'use')).locator('.pm-output__error')).toContainText('NameError', RUNTIME)

  const learner = await browser.newContext()
  const third = await learner.newPage()
  await openSection(third, 'session', 'use')
  await expect((await run(third, 'use')).locator('.pm-output__error')).toContainText('NameError', RUNTIME)
  await learner.close()

  await expect((await run(page, 'use')).locator('.pm-output__stdout')).toHaveText('42\n', RUNTIME)
})

test('a Markdown table that hidden code prints shows as a table of the page, without the code', async ({ page }) => {
  await page.goto(`${deck().web}/?section=table`)
  const block = page.locator('.pm-block[data-block="counts"]')
  await expect(block.locator('table tbody tr')).toHaveCount(2)
  await expect(block.locator('table')).toContainText('你好')
  await expect(block.locator('.pm-code, .pm-code-block__run')).toHaveCount(0)
  await expect(block.locator('.pm-outputs')).toHaveClass(/pm-outputs--prose/)
})
