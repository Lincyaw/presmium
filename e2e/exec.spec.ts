import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { useFixture } from './fixtures/deck.ts'
import { buildDeck, fixture, serve } from './fixtures/exec/deck.ts'
import type { BuiltDeck } from './fixtures/exec/deck.ts'

test.describe.configure({ mode: 'default' })
const panels = useFixture('exec/panels')
const RUNTIME = { timeout: 30_000 }

test('a run panel\'s parameters keep their types: a YAML false is False, at compile time and in Pyodide', async ({ page }) => {
  interface Block { node: { type: string, name?: string, children?: Block[], outputs?: { stdout: string }[] } }
  const blocks = (list: Block[]): Block[] => list.flatMap(block => [block, ...blocks(block.node.children ?? [])])
  const ir = JSON.parse(readFileSync(join(panels().dir, 'dist/ir.json'), 'utf8')) as { sections: { id: string, blocks: Block[] }[] }
  const code = blocks(ir.sections.find(section => section.id === 'exec-params')!.blocks).find(block => block.node.type === 'code')
  expect(code?.node.outputs?.map(run => run.stdout)).toEqual(['off 42\n'])

  await page.goto(`${panels().web}/exec.html#exec-params`)
  const panel = page.locator('.pm-section[data-section="exec-params"] .pm-run-panel')
  await panel.locator('.pm-run-panel__run').click()
  await expect(panel.locator('.pm-run-panel__output')).toHaveAttribute('data-source', 'live', RUNTIME)
  await expect(panel.locator('.pm-run-panel__stdout')).toHaveText('off 42\n')
})

const COMPILED = '平方： [1, 4, 9, 16, 25]\n合计： 55'

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

async function webSection(page: Page, id: string) {
  await page.goto(`${panels().web}/exec.html#${id}`)
  const section = page.locator(`.pm-section[data-section="${id}"]`)
  await section.scrollIntoViewIfNeeded()
  return section
}

test('in the document view, a stepwise run has a stepper of its own that goes back and forth', async ({ page }) => {
  const run = (await webSection(page, 'exec-steps')).locator('.pm-step-run')
  await expect(run).toHaveAttribute('data-state', 'ready', RUNTIME)
  await expect(run).toHaveAttribute('data-step', '12')
  await run.getByRole('button', { name: '上一步' }).click()
  await expect(run).toHaveAttribute('data-step', '11')
  await expect(run.locator('.pm-step-run__status')).toContainText('第 11 / 12 步')
  await expect(run.locator('.pm-step-run__output')).toHaveText('n=1 total=1\nn=2 total=3\nn=3 total=6\n')
  await run.getByRole('slider').focus()
  await page.keyboard.press('Home')
  await expect(run).toHaveAttribute('data-step', '0')
  await expect(run.locator('.pm-step-run__output')).toHaveText('')
  await run.getByRole('button', { name: '下一步' }).click()
  await expect(run).toHaveAttribute('data-line', '1')
})

test('in the document view, a stepwise run loads the Python runtime only once it nears the screen', async ({ page }) => {
  const runtime: string[] = []
  page.on('request', (request) => {
    if (request.url().endsWith('/pyodide.asm.wasm')) runtime.push(request.url())
  })
  await page.goto(`${panels().web}/exec.html`)
  await expect(page.locator('.pm-section[data-section="exec-panel"] .pm-run-panel__run')).toBeEnabled()
  await page.waitForLoadState('networkidle')
  const run = page.locator('.pm-section[data-section="exec-steps"] .pm-step-run')
  await expect(run).toHaveAttribute('data-state', 'loading')
  expect(runtime).toEqual([])
  await run.scrollIntoViewIfNeeded()
  await expect(run).toHaveAttribute('data-state', 'ready', RUNTIME)
  expect(runtime).toHaveLength(1)
})

test('a run in the browser cannot change what the next one finds: it gives what compile time recorded', async ({ page }) => {
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

test.describe('in the present view at 1920x1080', () => {
  test.use({ viewport: { width: 1920, height: 1080 } })

  async function code(present: Locator, selector: string) {
    const pre = present.locator(`${selector} pre`).first()
    await expect(pre).toBeVisible()
    return pre.evaluate((el: HTMLElement) => {
      const scale = el.getBoundingClientRect().width / el.offsetWidth
      return { size: Number.parseFloat(getComputedStyle(el.querySelector('code') ?? el).fontSize) * scale, cut: el.scrollWidth - el.clientWidth, hidden: el.scrollHeight - el.clientHeight }
    })
  }

  const textSize = (element: Locator) => element.evaluate((el: HTMLElement) => Number.parseFloat(getComputedStyle(el).fontSize) * el.getBoundingClientRect().width / el.offsetWidth)

  async function within(inner: Locator, outer: Locator) {
    const [a, b] = await Promise.all([inner.boundingBox(), outer.boundingBox()])
    return Boolean(a && b && a.y >= b.y - 1 && a.y + a.height <= b.y + b.height + 1)
  }

  test('a stepwise run steps forward and back with the present view', async ({ page }) => {
    await page.goto(`${panels().web}/exec.html?view=present&section=exec-steps`)
    const present = page.getByRole('region', { name: '放映' })
    const run = present.locator('.pm-step-run')
    await expect(run).toHaveAttribute('data-state', 'ready', RUNTIME)
    await expect(run.locator('.pm-step-run__stepper')).toHaveCount(0)
    for (let step = 1; step <= 5; step++) {
      await page.keyboard.press('ArrowRight')
      await expect(run).toHaveAttribute('data-step', String(step))
    }
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

  test('a stepwise run puts its output below the code, which keeps its width', async ({ page }) => {
    const run = (await webSection(page, 'exec-steps')).locator('.pm-step-run')
    const pre = run.locator('.pm-step-run__source pre')
    await expect(pre).toBeVisible()
    expect(await pre.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0)
    const [source, side] = await Promise.all([run.locator('.pm-step-run__source').boundingBox(), run.locator('.pm-step-run__side').boundingBox()])
    expect(side!.y).toBeGreaterThanOrEqual(source!.y + source!.height)
  })
})

test.describe('a French deck with JavaScript and TypeScript', () => {
  test.describe.configure({ mode: 'serial' })
  test.use({ locale: 'en-US' })
  let deck: BuiltDeck
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
