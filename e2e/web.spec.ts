import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { SLIDES, WEB } from './urls.ts'

/** The parts of the IR (packages/kernel/src/ir.ts) the tests read. */
interface MdastNode { type: string, value?: string, children?: MdastNode[] }
interface IRBlock {
  id: string
  role: 'visual' | 'narration'
  node: { type: 'markdown', mdast: MdastNode } | { type: 'code', value: string } | { type: 'component', name: string }
}
interface IRDocument { sections: { id: string, title: string, blocks: IRBlock[] }[] }

// Built web form (`presmium build`, examples/demo/dist/web) on WEB; the IR it renders is published as /ir.json.
// examples/demo/pages/web.md has a document section `web` and a section `scrolly` hinted `web: { layout: scrolly }`.

/** Letters and digits only: the IR text and the rendered page differ in spacing and punctuation. */
const words = (text: string) => text.replace(/[^\p{L}\p{N}]+/gu, '')

function mdastText(node: MdastNode): string {
  return typeof node.value === 'string' ? node.value : (node.children ?? []).map(mdastText).join('')
}

function blockText(block: IRBlock): string {
  const { node } = block
  return node.type === 'markdown' ? mdastText(node.mdast) : node.type === 'code' ? node.value : ''
}

async function published(page: Page): Promise<IRDocument> {
  return (await page.request.get(`${WEB}/ir.json`)).json()
}

/** Paths of the web pages, in sidebar order. */
async function webPages(page: Page): Promise<string[]> {
  await page.goto(WEB)
  const hrefs = await page.locator('.VPSidebar a').evaluateAll(links => links.map(a => (a as HTMLAnchorElement).pathname))
  return [...new Set(hrefs)]
}

/** Every rendered section with its heading, narration, visual text and section links, in page order. */
async function webSections(page: Page) {
  const sections = []
  for (const path of await webPages(page)) {
    await page.goto(`${WEB}${path}`)
    sections.push(...await page.locator('.pm-section').evaluateAll(els => els.map((el) => {
      const section = el as HTMLElement
      const text = (selector: string) => [...section.querySelectorAll(selector)].map(b => b.textContent).join('')
      return {
        id: section.dataset.section!,
        heading: section.querySelector(`h2#${CSS.escape(section.dataset.section!)}`)?.textContent ?? '',
        narration: text('.pm-block--narration'),
        visual: text('.pm-block--visual'),
        next: section.querySelector('.pm-section-nav__next')?.textContent ?? '',
      }
    })))
  }
  return sections
}

/** Search results; the view menu's options are not among them. */
const results = (page: Page) => page.getByRole('listbox').getByRole('option')

async function openSearch(page: Page) {
  await page.keyboard.press('Control+k')
  const input = page.getByRole('searchbox')
  await expect(input).toBeFocused()
  return input
}

/** Milliseconds from typing `query` until the search results show (the result list must be empty before). */
function timeSearch(page: Page, query: string): Promise<number> {
  return page.evaluate(q => new Promise<number>((resolve) => {
    const input = document.querySelector<HTMLInputElement>('input[type=search]')!
    const start = performance.now()
    input.value = q
    input.dispatchEvent(new Event('input', { bubbles: true }))
    const check = () => (document.querySelector('[role=option]') ? resolve(performance.now() - start) : requestAnimationFrame(check))
    check()
  }), query)
}

test('every IR section becomes one web section with its content, narration and section links', async ({ page }) => {
  const doc = await published(page)
  const sections = await webSections(page)
  expect(sections.map(s => s.id)).toEqual(doc.sections.map(s => s.id))
  for (const [i, section] of doc.sections.entries()) {
    const shown = sections[i]!
    expect(words(shown.heading), `heading of ${section.id}`).toBe(words(section.title))
    const narration = section.blocks.filter(b => b.role === 'narration').map(blockText).join('')
    expect(words(shown.narration), `narration of ${section.id}`).toBe(words(narration))
    for (const block of section.blocks.filter(b => b.role === 'visual')) {
      expect(words(shown.visual), `block ${section.id}#${block.id}`).toContain(words(blockText(block)))
    }
    // Previous and next section (P-72).
    if (doc.sections[i + 1]) expect(words(shown.next)).toContain(words(doc.sections[i + 1]!.title))
  }

  // {only} limits blocks to renderers: the web shows its own, never the slides' ones.
  await page.goto(`${WEB}/web.html`)
  const web = page.locator('.pm-section[data-section="web"]')
  await expect(web.locator('li', { hasText: '幻灯片与网页一键互跳' })).toBeVisible()
  await expect(web.locator('.pm-code')).toContainText('const viewer = createViewer(doc)')
  await expect(web).toContainText('网页中才有的补充说明')
  await expect(web).not.toContainText('幻灯片中才有的提示')
})

test('every plugin component of the demo renders in the web form', async ({ page }) => {
  const doc = await published(page)
  let count = 0
  for (const path of await webPages(page)) {
    await page.goto(`${WEB}${path}`)
    for (const id of await page.locator('.pm-section').evaluateAll(els => els.map(el => (el as HTMLElement).dataset.section!))) {
      const section = doc.sections.find(s => s.id === id)!
      for (const block of section.blocks.filter(b => b.node.type === 'component')) {
        const rendered = page.locator(`.pm-section[data-section="${id}"] .pm-block[data-block="${block.id}"]`)
        // Registered, loaded in the browser and rendered (inside its error boundary).
        await expect(rendered).toHaveAttribute('data-component', (block.node as { name: string }).name)
        await expect(rendered.locator('.pm-client-only, .pm-component-missing')).toHaveCount(0)
        await expect(rendered.locator('*').first()).toBeAttached()
        count++
      }
    }
  }
  expect(count).toBeGreaterThan(0)
  // Components keep working through @presmium/host: steps, error boundary.
  await page.goto(`${WEB}/core.html`)
  await expect(page.locator('.pm-demo-stepper')).toHaveAttribute('data-step', '3')
  await expect(page.locator('[data-pm-error="PmDemoBroken"]')).toBeVisible()
  await expect(page.locator('.pm-demo-greeting')).toBeVisible()
})

test('a Chinese keyword is found within 300 ms and opens its section', async ({ page }) => {
  await page.goto(WEB)
  const input = await openSearch(page)
  // The first query loads the index; time a later one. The time includes VitePress's 200 ms input debounce.
  await input.fill('网页')
  await expect(results(page).first()).toBeVisible()
  await input.fill('')
  await expect(results(page)).toHaveCount(0)

  expect(await timeSearch(page, '讲稿即正文')).toBeLessThan(300)
  await results(page).first().click()
  await expect(page).toHaveURL(/\/web\.html#web$/)
  await expect(page.locator('h2#web')).toBeInViewport()
})

test('search keeps working offline once the site has loaded', async ({ page, context }) => {
  await page.goto(WEB)
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined))
  await context.setOffline(true)
  expect((await page.reload())?.fromServiceWorker()).toBe(true)
  const input = await openSearch(page)
  // Code is indexed too.
  await input.fill('createViewer')
  await results(page).first().click()
  await expect(page.locator('h2#web')).toBeInViewport()
  await expect(page.locator('.pm-section[data-section="web"] .pm-code')).toContainText('createViewer')
})

test('no page scrolls sideways on a 375 px wide phone', async ({ page }) => {
  const paths = await webPages(page)
  await page.setViewportSize({ width: 375, height: 812 })
  for (const path of paths) {
    await page.goto(`${WEB}${path}`)
    await expect(page.locator('.pm-client-only')).toHaveCount(0)
    const [scroll, client] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth])
    expect(scroll, path).toBeLessThanOrEqual(client)
  }
})

test('a scrollytelling section advances its steps with the narration, and back', async ({ page }) => {
  await page.goto(`${WEB}/web.html`)
  const section = page.locator('.pm-section--scrolly[data-section="scrolly"]')
  const items = section.locator('.pm-stage li')
  const stepper = section.locator('.pm-block[data-component="PmDemoStepper"]')
  const scrollTo = (step: number) => section.locator(`.pm-step[data-step="${step}"]`).evaluate(el => el.scrollIntoView({ block: 'center' }))

  await expect(section).toHaveAttribute('data-step', '0')
  await expect(items.nth(0)).toBeVisible()
  await expect(items.nth(1)).toBeHidden()

  await scrollTo(2)
  await expect(section).toHaveAttribute('data-step', '2')
  await expect(items.nth(2)).toBeVisible()
  await expect(stepper).toBeVisible()
  await expect(stepper.locator('.pm-demo-stepper')).toHaveAttribute('data-step', '0')
  await expect(section.locator('.pm-stage')).toBeInViewport()

  await scrollTo(3)
  await expect(section).toHaveAttribute('data-step', '3')
  await expect(stepper.locator('.pm-demo-stepper')).toHaveAttribute('data-step', '1')
  await expect(stepper.locator('li').nth(1)).toBeHidden()

  await scrollTo(1)
  await expect(section).toHaveAttribute('data-step', '1')
  await expect(items.nth(2)).toBeHidden()
  await expect(stepper).toBeHidden()
})

test('the two forms link to each other at the same section and step', async ({ page }) => {
  const doc = await published(page)
  const index = doc.sections.findIndex(s => s.id === 'web') + 1

  // Web to slides: each section links to its slide (the section number), at the scrolled-to step.
  await page.goto(`${WEB}/web.html`)
  const web = page.locator('.pm-section[data-section="web"]')
  const toSlides = new URL((await web.getByRole('link', { name: '在幻灯片中打开' }).getAttribute('href'))!)
  expect(toSlides.pathname).toMatch(new RegExp(`/${index}$`))
  const scrolly = page.locator('.pm-section[data-section="scrolly"]')
  await scrolly.locator('.pm-step[data-step="2"]').evaluate(el => el.scrollIntoView({ block: 'center' }))
  await expect(scrolly).toHaveAttribute('data-step', '2')
  const atStep = new URL((await scrolly.getByRole('link', { name: '在幻灯片中打开' }).getAttribute('href'))!)
  expect(`${atStep.pathname}${atStep.search}`).toMatch(new RegExp(`/${index + 1}\\?clicks=2$`))

  // Slides to web: the slides form's button opens `?slide=N`, which lands on section N; a step can be given too.
  await page.goto(`${WEB}/?slide=${index}`)
  await expect(page).toHaveURL(/\/web\.html/)
  await expect(page.locator('h2#web')).toBeInViewport()
  await page.goto(`${WEB}/?section=scrolly&step=2`)
  await expect(scrolly).toHaveAttribute('data-step', '2')
  await expect(scrolly.locator('.pm-step[data-step="2"]')).toBeInViewport()
})

test('the built slides form and the web form open each other', async ({ page }) => {
  const doc = await published(page)
  const index = doc.sections.findIndex(s => s.id === 'web') + 1
  await page.goto(`${WEB}/web.html`)
  const link = page.locator('.pm-section[data-section="web"]').getByRole('link', { name: '在幻灯片中打开' })
  const toSlides = new URL((await link.getAttribute('href'))!)
  await page.goto(`${SLIDES}/${toSlides.pathname.split('/').at(-1)}`)
  await expect(page.locator(`.slidev-page-${index}`)).toContainText('网页形态')
  const toWeb = new URL((await page.getByRole('link', { name: '在网页中阅读' }).getAttribute('href'))!)
  await page.goto(`${WEB}/${toWeb.search}`)
  await expect(page.locator('h2#web')).toBeInViewport()
})
