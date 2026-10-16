import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { useFixture } from './fixtures/deck.ts'
import { buildDeck, fixture, serve } from './fixtures/exec/deck.ts'
import type { BuiltDeck } from './fixtures/exec/deck.ts'

// e2e/fixtures/exec/panels, built by `presmium build`. Slides are found by their
// section id in the built IR and located by their headings, since Slidev keeps
// preloaded slides in the DOM too. Loading the Python runtime takes a few seconds,
// hence the longer waits for first results.
test.describe.configure({ mode: 'default' })
const panels = useFixture('exec/panels')
const RUNTIME = { timeout: 30_000 }

async function openSlide(page: Page, id: string, heading: string, query = '') {
  await page.goto(`${panels().slides}/${panels().slide(id)}${query}`)
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
  await page.goto(`${panels().web}/exec.html`)
  await expect(page.getByText('合计： 55').first()).toBeVisible()
  await expect(page.getByText('print("合计：", sum(squares))').first()).toBeVisible()
})

test('in the web form, code that also runs live runs again in the browser, with the Pyodide runtime the site serves', async ({ page }) => {
  await page.goto(`${panels().web}/exec.html`)
  const block = page.locator('.pm-section[data-section="exec-compile"] .pm-code-block[data-run="both"]')
  const outputs = block.locator('.pm-outputs')
  await expect(outputs).toHaveAttribute('data-source', 'recorded')
  await block.getByRole('button', { name: '运行' }).click()
  await expect(outputs).toHaveAttribute('data-source', 'live', RUNTIME)
  await expect(outputs.locator('.pm-output__stdout')).toHaveText(`${COMPILED}\n`)
  await expect(outputs.locator('.pm-output')).toHaveAttribute('data-executor', 'pyodide')
})

// ---------------------------------------------------------------------------
// The web form: the document view (every step shown) and the present view
// ---------------------------------------------------------------------------

/** The section `id` of the fixture's page in the document view, scrolled to. */
async function webSection(page: Page, id: string) {
  await page.goto(`${panels().web}/exec.html#${id}`)
  const section = page.locator(`.pm-section[data-section="${id}"]`)
  await section.scrollIntoViewIfNeeded()
  return section
}

test('in the document view, a stepwise run has a stepper of its own that goes back and forth (R-28)', async ({ page }) => {
  const run = (await webSection(page, 'exec-steps')).locator('.pm-step-run')
  await expect(run).toHaveAttribute('data-state', 'ready', RUNTIME)
  // The document view shows the final state; the stepper goes back from there.
  await expect(run).toHaveAttribute('data-step', '12')
  await run.getByRole('button', { name: '上一步' }).click()
  await expect(run).toHaveAttribute('data-step', '11')
  await expect(run.locator('.pm-step-run__status')).toContainText('第 11 / 12 步')
  await expect(run.locator('.pm-step-run__output')).toHaveText('n=1 total=1\nn=2 total=3\nn=3 total=6\n')
  // The slider goes to any step, with the keyboard too.
  await run.getByRole('slider').focus()
  await page.keyboard.press('Home')
  await expect(run).toHaveAttribute('data-step', '0')
  await expect(run.locator('.pm-step-run__output')).toHaveText('')
  await run.getByRole('button', { name: '下一步' }).click()
  await expect(run).toHaveAttribute('data-line', '1')
})

test('in the document view, a stepwise run loads the Python runtime only once it nears the screen (R-103)', async ({ page }) => {
  const runtime: string[] = []
  page.on('request', (request) => {
    if (request.url().endsWith('/pyodide.asm.wasm')) runtime.push(request.url())
  })
  await page.goto(`${panels().web}/exec.html`)
  // The plugins have started (the run panel can run) and the page has nothing left to load.
  await expect(page.locator('.pm-section[data-section="exec-panel"] .pm-run-panel__run')).toBeEnabled()
  await page.waitForLoadState('networkidle')
  const run = page.locator('.pm-section[data-section="exec-steps"] .pm-step-run')
  await expect(run).toHaveAttribute('data-state', 'loading')
  expect(runtime).toEqual([])
  await run.scrollIntoViewIfNeeded()
  await expect(run).toHaveAttribute('data-state', 'ready', RUNTIME)
  expect(runtime).toHaveLength(1)
})

test('a run in the browser cannot change what the next one finds: it gives what compile time recorded (R-99)', async ({ page }) => {
  const blocks = (await webSection(page, 'exec-isolation')).locator('.pm-code-block[data-run="both"]')
  const [writer, reader] = [blocks.nth(0), blocks.nth(1)]
  await expect(reader.locator('.pm-output__stdout')).toHaveText('False 100\n')
  await writer.getByRole('button', { name: '运行' }).click()
  await expect(writer.locator('.pm-outputs')).toHaveAttribute('data-source', 'live', RUNTIME)
  await expect(writer.locator('.pm-output__stdout')).toHaveText('写好了 data.txt\n')
  await reader.getByRole('button', { name: '运行' }).click()
  await expect(reader.locator('.pm-outputs')).toHaveAttribute('data-source', 'live', RUNTIME)
  await expect(reader.locator('.pm-output__stdout')).toHaveText('False 100\n')
})

test('a page restored from the back-forward cache keeps one Python runtime (R-102)', async ({ page }) => {
  const panel = (await webSection(page, 'exec-panel')).locator('.pm-run-panel')
  const button = panel.locator('.pm-run-panel__run')
  const runtimes = () => page.workers().filter(worker => worker.url().includes('pyodide.worker')).length
  await button.click()
  await expect(panel.locator('.pm-run-panel__output')).toHaveAttribute('data-source', 'live', RUNTIME)
  expect(runtimes()).toBe(1)
  // Hidden into the cache and shown again: the hosts stop the kernel and start it again.
  await page.evaluate(async () => {
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }))
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
    await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)))
  })
  await expect(button).toBeEnabled()
  await button.click()
  await expect(panel).toHaveAttribute('data-runs', '2', RUNTIME)
  await expect(panel.locator('.pm-run-panel__output')).toHaveAttribute('data-source', 'live')
  await expect.poll(runtimes).toBe(1)
})

test.describe('in the present view at 1920x1080', () => {
  test.use({ viewport: { width: 1920, height: 1080 } })

  /** The size of the code's text on the screen, in px, and how much of a line is cut. */
  async function code(present: Locator, selector: string) {
    const pre = present.locator(`${selector} pre`).first()
    await expect(pre).toBeVisible()
    return pre.evaluate((el: HTMLElement) => {
      const scale = el.getBoundingClientRect().width / el.offsetWidth
      return { size: Number.parseFloat(getComputedStyle(el.querySelector('code') ?? el).fontSize) * scale, cut: el.scrollWidth - el.clientWidth }
    })
  }

  test('the code of a run panel and of a stepwise run follows the size of the slide and is not cut (R-27)', async ({ page }) => {
    for (const [id, selector] of [['exec-panel', '.pm-run-panel'], ['exec-steps', '.pm-step-run']] as const) {
      await page.goto(`${panels().web}/exec.html?view=present&section=${id}`)
      const present = page.getByRole('region', { name: '放映' })
      await expect(present).toHaveAttribute('data-section', id)
      const { size, cut } = await code(present, selector)
      expect(size, id).toBeGreaterThanOrEqual(18)
      expect(cut, id).toBeLessThanOrEqual(0)
    }
  })

  test('a stepwise run steps forward and back with the present view (R-109)', async ({ page }) => {
    await page.goto(`${panels().web}/exec.html?view=present&section=exec-steps`)
    const present = page.getByRole('region', { name: '放映' })
    const run = present.locator('.pm-step-run')
    await expect(run).toHaveAttribute('data-state', 'ready', RUNTIME)
    await expect(run.locator('.pm-step-run__stepper')).toHaveCount(0)
    for (let step = 1; step <= 5; step++) {
      await page.keyboard.press('ArrowRight')
      await expect(run).toHaveAttribute('data-step', String(step))
    }
    // Executed lines: 1, 2, 3, 4, 2, ...
    await expect(run).toHaveAttribute('data-line', '2')
    await page.keyboard.press('ArrowLeft')
    await expect(present).toHaveAttribute('data-step', '4')
    await expect(run).toHaveAttribute('data-line', '4')
    await expect(run.locator('.pm-step-run__line')).toHaveText('    print(f"n={n} total={total}")')
    await expect(run.locator('.pm-step-run__output')).toHaveText('n=1 total=1\n')
  })
})

test.describe('on a phone', () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true })

  test('a stepwise run puts its output below the code, which keeps its width (R-27)', async ({ page }) => {
    const run = (await webSection(page, 'exec-steps')).locator('.pm-step-run')
    const pre = run.locator('.pm-step-run__source pre')
    await expect(pre).toBeVisible()
    expect(await pre.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0)
    const [source, side] = await Promise.all([run.locator('.pm-step-run__source').boundingBox(), run.locator('.pm-step-run__side').boundingBox()])
    expect(side!.y).toBeGreaterThanOrEqual(source!.y + source!.height)
  })
})

// ---------------------------------------------------------------------------
// e2e/fixtures/exec/english: a deck in French (a language Presmium has no messages for, so the
// interface follows the browser's, English) with JavaScript and TypeScript code
// ---------------------------------------------------------------------------

test.describe('a French deck with JavaScript and TypeScript', () => {
  test.describe.configure({ mode: 'serial' })
  test.use({ locale: 'en-US' })
  let deck: BuiltDeck
  /** Built together, the forms are one site: the web form under /web/, the slides under /slides/. */
  let site: Awaited<ReturnType<typeof serve>>
  const slides = { get url() { return `${site.url}/slides` } }
  const web = { get url() { return `${site.url}/web` } }

  test.beforeAll(async () => {
    test.setTimeout(240_000)
    deck = await buildDeck('exec-english', fixture('english'))
    site = await serve(join(deck.dir, 'dist'), '/slides/')
  })

  test.afterAll(async () => {
    await site?.close()
    deck?.remove()
  })

  async function slidePanel(page: Page, id: string) {
    const no = deck.slides[id]
    await page.goto(`${slides.url}/${no}`)
    return page.locator(`.slidev-page-${no} .pm-run-panel`)
  }

  test('in the slides form, the run panels run JavaScript and TypeScript and speak English (R-01)', async ({ page }) => {
    const js = await slidePanel(page, 'js-panel')
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr')
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

  test('code that prints from a timer records at compile time what it prints in the browser', async ({ page }) => {
    interface Block { node: { type: string, children?: Block[], outputs?: { stdout: string }[] } }
    const ir = JSON.parse(readFileSync(join(deck.dir, 'dist/ir.json'), 'utf8')) as { sections: { id: string, blocks: Block[] }[] }
    const blocks = (list: Block[]): Block[] => list.flatMap(block => [block, ...blocks(block.node.children ?? [])])
    const code = blocks(ir.sections.find(section => section.id === 'js-later')!.blocks).find(block => block.node.type === 'code')
    expect(code?.node.outputs?.map(run => run.stdout)).toEqual(['now\nlater\n'])

    const panel = await slidePanel(page, 'js-later')
    await panel.getByRole('button', { name: 'Run', exact: true }).click()
    await expect(panel.locator('.pm-run-panel__output')).toHaveAttribute('data-source', 'live')
    await expect(panel.locator('.pm-run-panel__stdout')).toHaveText('now\nlater\n')
  })

  test('a promise that rejects after the code ran fails the run, in the browser as at compile time (R-105)', async ({ page }) => {
    interface Block { node: { type: string, children?: Block[], outputs?: { exitCode: number | null, stderr: string }[] } }
    const ir = JSON.parse(readFileSync(join(deck.dir, 'dist/ir.json'), 'utf8')) as { sections: { id: string, blocks: Block[] }[] }
    const blocks = (list: Block[]): Block[] => list.flatMap(block => [block, ...blocks(block.node.children ?? [])])
    const code = blocks(ir.sections.find(section => section.id === 'js-rejected')!.blocks).find(block => block.node.type === 'code')
    expect(code?.node.outputs?.[0]).toMatchObject({ exitCode: 1, stderr: expect.stringContaining('Error: late') })

    const panel = await slidePanel(page, 'js-rejected')
    await panel.getByRole('button', { name: 'Run', exact: true }).click()
    const output = panel.locator('.pm-run-panel__output')
    await expect(output).toHaveAttribute('data-ok', 'false')
    await expect(output.locator('.pm-run-panel__stdout')).toHaveText('started\n')
    await expect(output.locator('.pm-run-panel__stderr')).toContainText('Error: late')
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
