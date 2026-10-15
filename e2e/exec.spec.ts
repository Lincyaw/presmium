import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { buildDeck, fixture, serve } from './fixtures/exec/deck.ts'
import type { BuiltDeck } from './fixtures/exec/deck.ts'
import { SLIDES, WEB } from './urls.ts'

// examples/demo/pages/exec.md, built by `presmium build`. Slides are found by their
// section id in the built IR and located by their headings, since Slidev keeps
// preloaded slides in the DOM too. Loading the Python runtime takes a few seconds,
// hence the longer waits for first results.
const DIST = new URL('../examples/demo/dist/', import.meta.url)
const HAS_WEB = existsSync(new URL('web', DIST))
const RUNTIME = { timeout: 30_000 }

function slideOf(id: string): number {
  const ir = JSON.parse(readFileSync(new URL('ir.json', DIST), 'utf8')) as { sections: { id: string, index: number }[] }
  return ir.sections.find(section => section.id === id)!.index
}

async function openSlide(page: Page, id: string, heading: string, query = '') {
  await page.goto(`${SLIDES}/${slideOf(id)}${query}`)
  const slide = page.locator('.slidev-page').filter({ has: page.locator('h1', { hasText: heading }) })
  await expect(slide).toBeVisible()
  return slide
}

async function openPanel(page: Page, id: string, heading: string) {
  const panel = (await openSlide(page, id, heading)).locator('.pm-run-panel')
  await expect(panel.locator('.pm-run-panel__run')).toBeEnabled()
  return panel
}

test('Python runs in the browser; rerunning with a changed parameter shows the difference between the runs', async ({ page }) => {
  const panel = await openPanel(page, 'exec-panel', '执行面板')
  await panel.locator('.pm-run-panel__run').click()
  await expect(panel.locator('.pm-run-panel__stdout')).toHaveText('1 1\n2 1\n3 2\n4 3\n5 5\n', RUNTIME)
  await expect(panel.locator('.pm-run-panel__output')).toHaveAttribute('data-source', 'live')
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

test('opening the stepwise slide at a step shows the same as stepping there', async ({ page }) => {
  const jumped = (await openSlide(page, 'exec-steps', '分步执行', '?clicks=7')).locator('.pm-step-run')
  await expect(jumped).toHaveAttribute('data-state', 'ready', RUNTIME)
  await expect(jumped).toHaveAttribute('data-step', '7')
  await expect(page).toHaveURL(/clicks=7/)
  const expected = await jumped.innerHTML()

  const stepped = (await openSlide(page, 'exec-steps', '分步执行')).locator('.pm-step-run')
  await expect(stepped).toHaveAttribute('data-state', 'ready', RUNTIME)
  for (let step = 1; step <= 7; step++) {
    await page.keyboard.press('ArrowRight')
    await expect(stepped).toHaveAttribute('data-step', String(step))
  }
  expect(await stepped.innerHTML()).toBe(expected)

  // Going back from the next slide, before anything has been traced, lands on the last step.
  await openSlide(page, 'exec-fallback', '预录输出回退')
  await page.keyboard.press('ArrowLeft')
  const back = page.locator('.slidev-page', { has: page.locator('h1', { hasText: '分步执行' }) }).locator('.pm-step-run')
  await expect(back).toBeVisible()
  await expect(back).toHaveAttribute('data-step', '12', RUNTIME)
  await expect(back.locator('.pm-step-run__output')).toHaveText('n=1 total=1\nn=2 total=3\nn=3 total=6\ndone\n')
})

test('a run that times out shows the recorded output, marked as recorded', async ({ page }) => {
  const panel = await openPanel(page, 'exec-fallback', '预录输出回退')
  await panel.locator('.pm-run-panel__run').click()
  const output = panel.locator('.pm-run-panel__output')
  await expect(output).toHaveAttribute('data-source', 'recorded', RUNTIME)
  await expect(output.locator('.pm-run-panel__badge')).toHaveText('预录输出 · 执行超时')
  await expect(output.locator('.pm-run-panel__stdout')).toHaveText('x = 1.4142135623730951（√2，预先录制）')
})

const COMPILED = '平方： [1, 4, 9, 16, 25]\n合计： 55'

test('output recorded at compile time is shown with its code in the slides', async ({ page }) => {
  const slide = await openSlide(page, 'exec-compile', '编译时执行')
  await expect(slide.locator('.pm-output')).toContainText(COMPILED)
})

test('output recorded at compile time is shown with its code in the web form', async ({ page }) => {
  test.skip(!HAS_WEB, 'needs the web build (examples/demo/dist/web)')
  await page.goto(`${WEB}/exec.html`)
  await expect(page.getByText('合计： 55').first()).toBeVisible()
  await expect(page.getByText('print("合计：", sum(squares))').first()).toBeVisible()
})

test('in the web form, code that also runs live runs again in the browser, with the Pyodide runtime the site serves', async ({ page }) => {
  test.skip(!HAS_WEB, 'needs the web build (examples/demo/dist/web)')
  await page.goto(`${WEB}/exec.html`)
  const block = page.locator('.pm-section[data-section="exec-compile"] .pm-code-block[data-run="both"]')
  const outputs = block.locator('.pm-outputs')
  await expect(outputs).toHaveAttribute('data-source', 'recorded')
  await block.getByRole('button', { name: '运行' }).click()
  await expect(outputs).toHaveAttribute('data-source', 'live', RUNTIME)
  await expect(outputs.locator('.pm-output__stdout')).toHaveText(`${COMPILED}\n`)
  await expect(outputs.locator('.pm-output')).toHaveAttribute('data-executor', 'pyodide')
})

// ---------------------------------------------------------------------------
// e2e/fixtures/exec/english: a deck in en-US with JavaScript and TypeScript code
// ---------------------------------------------------------------------------

test.describe('an English deck with JavaScript and TypeScript', () => {
  test.describe.configure({ mode: 'serial' })
  let deck: BuiltDeck
  let slides: Awaited<ReturnType<typeof serve>>
  let web: Awaited<ReturnType<typeof serve>>

  test.beforeAll(async () => {
    test.setTimeout(240_000)
    deck = await buildDeck('exec-english', fixture('english'))
    slides = await serve(join(deck.dir, 'dist/slides'), true)
    web = await serve(join(deck.dir, 'dist/web'), false)
  })

  test.afterAll(async () => {
    await slides?.close()
    await web?.close()
    deck?.remove()
  })

  async function slidePanel(page: Page, id: string) {
    const no = deck.slides[id]
    await page.goto(`${slides.url}/${no}`)
    return page.locator(`.slidev-page-${no} .pm-run-panel`)
  }

  test('in the slides form, the run panels run JavaScript and TypeScript and speak English', async ({ page }) => {
    const js = await slidePanel(page, 'js-panel')
    await js.getByRole('button', { name: 'Run', exact: true }).click()
    await expect(js.locator('.pm-run-panel__stdout')).toHaveText('1 1\n2 4\n3 9\n4 16\n')
    await expect(js.locator('.pm-run-panel__output')).toHaveAttribute('data-source', 'live')
    await expect(js.getByRole('button', { name: 'Run again', exact: true })).toBeEnabled()

    const ts = await slidePanel(page, 'ts-panel')
    await ts.getByRole('button', { name: 'Run', exact: true }).click()
    await expect(ts.locator('.pm-run-panel__stdout')).toHaveText('Hello, Presmium\n')

    // A script that never ends is stopped at its timeout and shows its recorded output.
    const endless = await slidePanel(page, 'js-timeout')
    await endless.getByRole('button', { name: 'Run', exact: true }).click()
    await expect(endless.locator('.pm-run-panel__badge')).toHaveText('Recorded output · timed out')
    await expect(endless.locator('.pm-run-panel__stdout')).toHaveText('settled at 1.4142135623730951 (recorded)')

    // The other plugins of the deck speak English too: the local environment and the toolbar's switch.
    await page.goto(`${slides.url}/${deck.slides['local-env']}`)
    await expect(page.locator('.pm-local-env__notice').filter({ visible: true })).toHaveText('The local environment is available only from the dev server')
    await expect(page.getByRole('switch', { name: 'High contrast' }).filter({ visible: true })).toHaveCount(1)
  })

  test('in the web form, a run panel and live code run JavaScript in the browser', async ({ page }) => {
    await page.goto(`${web.url}/`)
    const js = page.locator('.pm-section[data-section="js-panel"] .pm-run-panel')
    await js.getByRole('button', { name: 'Run', exact: true }).click()
    await expect(js.locator('.pm-run-panel__stdout')).toHaveText('1 1\n2 4\n3 9\n4 16\n')

    const live = page.locator('.pm-section[data-section="js-live"] .pm-code-block[data-run="live"]')
    await live.locator('.pm-code-block__run button').click()
    await expect(live.locator('.pm-output__stdout')).toHaveText('RUN IN THE BROWSER\n')
    await expect(live.locator('.pm-output')).toHaveAttribute('data-executor', 'js-worker')
    await expect(page.getByRole('switch', { name: 'High contrast' }).filter({ visible: true })).toHaveCount(1)
  })
})
