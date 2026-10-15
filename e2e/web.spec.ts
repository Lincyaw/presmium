import { expect, test } from '@playwright/test'
import type { Browser, Page } from '@playwright/test'
import { fixtureDeck } from './fixtures/core/deck.ts'
import type { FixtureDeck } from './fixtures/core/deck.ts'
import { SLIDES, WEB } from './urls.ts'

/** The parts of the IR (packages/kernel/src/ir.ts) the tests read. */
interface MdastNode { type: string, value?: string, children?: MdastNode[] }
interface IRBlock {
  id: string
  role: 'visual' | 'narration'
  node: { type: 'markdown', mdast: MdastNode } | { type: 'code', lang: string, value: string } | { type: 'component', name: string }
}
interface IRDocument { sections: { id: string, title: string, blocks: IRBlock[] }[] }

// Built web form (`presmium build`, examples/demo/dist/web) on WEB; the IR it renders is published as /ir.json.
// examples/demo/pages/web.md has a document section `web` and a section `scrolly` hinted `web: { layout: scrolly }`.

/** Letters and digits only: the IR text and the rendered page differ in spacing and punctuation. */
const words = (text: string) => text.replace(/[^\p{L}\p{N}]+/gu, '')

/**
 * The text of the IR that the page shows as text. Math and diagrams are drawn
 * (their source does not show; see RICH), raw HTML shows its text without its
 * tags or styles, and footnote references have no text.
 */
function mdastText(node: MdastNode): string {
  if (node.type === 'math' || node.type === 'inlineMath') return ''
  if (node.type === 'html') return (node.value ?? '').replace(/<(style|script)\b[\s\S]*?<\/\1\s*>/gi, '').replace(/<[^>]*>/g, '')
  return typeof node.value === 'string' ? node.value : (node.children ?? []).map(mdastText).join('')
}

function blockText(block: IRBlock): string {
  const { node } = block
  if (node.type === 'code') return node.lang === 'mermaid' ? '' : node.value
  return node.type === 'markdown' ? mdastText(node.mdast) : ''
}

/** Drawn content (math, diagrams), left out of the page text as its source is left out of the IR text. */
const RICH = '.pm-math, .pm-mermaid'

async function published(page: Page): Promise<IRDocument> {
  return (await page.request.get(`${WEB}/ir.json`)).json()
}

/** Paths of the web pages of the site at `site`, in sidebar order. */
async function webPages(page: Page, site = WEB): Promise<string[]> {
  await page.goto(site)
  const hrefs = await page.locator('.VPSidebar a').evaluateAll(links => links.map(a => (a as HTMLAnchorElement).pathname))
  return [...new Set(hrefs)]
}

/** Opens every page of the site at `origin` and expects none to scroll sideways. */
async function expectNoSidewaysScroll(page: Page, origin: string, paths: string[]) {
  for (const path of paths) {
    await page.goto(`${origin}${path}`)
    await expect(page.locator('.pm-client-only')).toHaveCount(0)
    const [scroll, client] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth])
    expect(scroll, path).toBeLessThanOrEqual(client)
  }
}

/** A phone: 375 CSS px wide, with a mobile viewport and touch. */
function phone(browser: Browser) {
  return browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true })
}

/** Every rendered section with its heading, narration, visual text and section links, in page order. */
async function webSections(page: Page) {
  const sections = []
  for (const path of await webPages(page)) {
    await page.goto(`${WEB}${path}`)
    sections.push(...await page.locator('.pm-section').evaluateAll((els, rich) => els.map((el) => {
      const section = el as HTMLElement
      const textOf = (node: Node): string => node instanceof Element && node.matches(rich)
        ? ''
        : node.nodeType === Node.TEXT_NODE ? node.textContent ?? '' : [...node.childNodes].map(textOf).join('')
      const text = (selector: string) => [...section.querySelectorAll(selector)].map(textOf).join('')
      return {
        id: section.dataset.section!,
        heading: section.querySelector(`h2#${CSS.escape(section.dataset.section!)}`)?.textContent ?? '',
        narration: text('.pm-block--narration'),
        visual: text('.pm-block--visual'),
        next: section.querySelector('.pm-section-nav__next')?.textContent ?? '',
      }
    }), RICH))
  }
  return sections
}

/** Search results; the view menu's options are not among them. */
const results = (page: Page) => page.getByRole('listbox').getByRole('option')

/** Opens the search box with its shortcut, again until the page has hydrated and takes it. */
async function openSearch(page: Page) {
  const input = page.getByRole('searchbox')
  await expect(async () => {
    if (!await input.isVisible()) await page.keyboard.press('Control+k')
    await expect(input).toBeFocused({ timeout: 500 })
  }).toPass({ timeout: 10_000 })
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
  await expect(page.locator('.pm-section[data-section="core"] .pm-demo-stepper')).toHaveAttribute('data-step', '3')
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

test('a section title alone finds its section', async ({ page }) => {
  await page.goto(`${WEB}/core.html`)
  const input = await openSearch(page)
  await input.fill('滚动叙事')
  const first = results(page).first()
  await expect(first.locator('.title')).toContainText('滚动叙事')
  await first.click()
  await expect(page).toHaveURL(/\/web\.html#scrolly$/)
  await expect(page.locator('h2#scrolly')).toBeInViewport()
})

test('the page outline lists the page\'s sections, also after moving to another page; each section links to the previous one', async ({ page }) => {
  const outline = page.locator('.VPDocAsideOutline .VPDocOutlineItem.root > li > a')
  const titles = page.locator('.pm-section > h2')
  await page.goto(`${WEB}/web.html`)
  await expect(titles.first()).toBeVisible()
  await expect(outline).toHaveText(await titles.allTextContents())

  await page.locator('.VPSidebar a[href$="/core.html"]').click()
  await expect(page).toHaveURL(/\/core\.html$/)
  await expect(page.locator('h2#core')).toBeVisible()
  await expect(outline).toHaveText(await titles.allTextContents())

  // The first section of web.html links back to the last section of the page before it.
  const doc = await published(page)
  const previous = doc.sections[doc.sections.findIndex(s => s.id === 'web') - 1]!
  await page.goto(`${WEB}/web.html`)
  const back = page.locator('.pm-section[data-section="web"] .pm-section-nav__prev')
  await expect(back).toContainText(previous.title)
  await back.click()
  await expect(page.locator(`h2#${previous.id}`)).toBeInViewport()
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

test('no page scrolls sideways on a 375 px wide phone', async ({ page, browser }) => {
  const paths = await webPages(page)
  const context = await phone(browser)
  await expectNoSidewaysScroll(await context.newPage(), WEB, paths)
  await context.close()
})

test('pages reflow at 200 % and 400 % zoom and follow the reader\'s font size', async ({ page, browser }) => {
  const paths = await webPages(page)
  // 200 %: 640 CSS px on a 1280 px wide screen; 400 %: 320 CSS px.
  for (const options of [{ viewport: { width: 640, height: 400 }, deviceScaleFactor: 2 }, { viewport: { width: 320, height: 256 } }]) {
    const context = await browser.newContext(options)
    await expectNoSidewaysScroll(await context.newPage(), WEB, paths)
    await context.close()
  }

  // The browser's default font size (a Chromium setting) sizes the text.
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Page.setFontSizes', { fontSizes: { standard: 24 } })
  await page.goto(`${WEB}/web.html`)
  const size = (selector: string) => page.locator(selector).first().evaluate(el => getComputedStyle(el).fontSize)
  expect(await size('html')).toBe('24px')
  expect(await size('body')).toBe('24px')
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

test('without any deck configuration the slides offer "read on the web", which opens slide N at step S', async ({ page }) => {
  // The deck configures no addon for the button: the slides renderer adds it because the deck has a web form.
  const doc = await published(page) as IRDocument & { config: { renderers: Record<string, { addons?: unknown }> } }
  expect(doc.config.renderers.slides?.addons).toBeUndefined()
  const index = doc.sections.findIndex(s => s.id === 'scrolly') + 1

  await page.goto(`${SLIDES}/${index}?clicks=2`)
  await expect(page.locator(`.slidev-page-${index}`)).toContainText('滚动叙事')
  const toWeb = new URL((await page.getByRole('link', { name: '在网页中阅读' }).getAttribute('href'))!)
  expect(toWeb.search).toBe(`?slide=${index}&step=2`)
  await page.goto(`${WEB}/${toWeb.search}`)
  await expect(page).toHaveURL(/\/web\.html/)
  const scrolly = page.locator('.pm-section[data-section="scrolly"]')
  await expect(scrolly).toHaveAttribute('data-step', '2')
  await expect(scrolly.locator('.pm-step[data-step="2"]')).toBeInViewport()
})

test('a component counts its steps from its block in the web form too', async ({ page }) => {
  // In the present view, the stepper of core (at step 0) at step 1 and the one of core-scope (at step 2) at step 3.
  const stepper = async (section: string, step: number) => {
    await page.goto(`${WEB}/core.html?view=present&section=${section}&step=${step}`)
    const present = page.getByRole('region', { name: '放映' })
    await expect(present).toHaveAttribute('data-step', String(step))
    const shown = present.locator('.pm-demo-stepper')
    await expect(shown).toHaveAttribute('data-step', '1')
    await expect(shown.locator('li[data-status="active"]')).toHaveText('解析文稿')
    await expect(shown.locator('li').nth(1)).toBeHidden()
    return shown.innerHTML()
  }
  expect(await stepper('core-scope', 3)).toBe(await stepper('core', 1))
})

test('the demo plugins start in the web form as in the slides: the greeting shows, the start report agrees', async ({ page }) => {
  await page.goto(`${WEB}/core.html`)
  await expect(page.locator('.pm-demo-greeting')).toHaveText('presmium.demo.consumer 收到 presmium.demo.provider 的问候')

  // The start report is a presenter panel in both forms: the presenter window of the web form, the presenter view of the slides.
  const demoPlugins = async () => {
    await page.locator('.pm-presenter-panels summary').click()
    const plugins = page.locator('.pm-start-report [data-plugin^="presmium.demo."]')
    await expect(plugins).toHaveCount(3)
    return Object.fromEntries(await plugins.evaluateAll(items => items.map(li => [(li as HTMLElement).dataset.plugin, (li as HTMLElement).dataset.status])))
  }
  await page.goto(`${WEB}/core.html?view=presenter&section=core`)
  const web = await demoPlugins()
  expect(web).toEqual({ 'presmium.demo.consumer': 'started', 'presmium.demo.provider': 'started', 'presmium.demo.orphan': 'disabled' })
  await page.goto(`${SLIDES}/presenter/2`)
  expect(await demoPlugins()).toEqual(web)
})

// e2e/fixtures/core/deck: an en-US deck with a long title and a test plugin (fixture.core) whose
// components read their section's configuration and share a state, and whose kernel plugins
// cannot all start. The web form is served under /web/.
test.describe('the fixture deck in the web form', () => {
  test.describe.configure({ mode: 'serial', timeout: 120_000 })
  let deck: FixtureDeck
  const site = (path = '') => `${deck.url}/web/${path}`

  test.beforeAll(async () => {
    test.setTimeout(300_000)
    deck = await fixtureDeck()
  })
  test.afterAll(() => deck?.close())

  test('a section\'s {config} overrides a plugin option in its section only', async ({ page }) => {
    await page.goto(site())
    const label = (section: string) => page.locator(`.pm-section[data-section="${section}"] .fx-config`)
    await expect(label('global')).toHaveText('global')
    await expect(label('scoped')).toHaveText('section')
    await expect(label('presmium-fixture-deck-with-a-title-too-long-for-a-phone')).toHaveText('cover')
  })

  test('two windows of the deck share a plugin state', async ({ context }) => {
    const [a, b] = [await context.newPage(), await context.newPage()]
    await a.goto(site())
    // The other window presents the section.
    await b.goto(`${site()}?view=present&section=shared`)
    const [shown, presented] = [a.locator('.pm-section[data-section="shared"] .fx-shared'), b.locator('.pm-present .fx-shared')]
    await expect(presented.locator('output')).toHaveText('0')
    await shown.getByRole('button', { name: 'Add one' }).click()
    await expect(presented.locator('output')).toHaveText('1')
    await presented.getByRole('button', { name: 'Add one' }).click()
    await expect(shown.locator('output')).toHaveText('2')
  })

  test('an en-US deck sets <html lang> and speaks English: the VitePress chrome, the links to the slides, the start report', async ({ page }) => {
    await page.goto(site())
    await expect(page.locator('html')).toHaveAttribute('lang', 'en-US')
    await expect(page.locator('.DocSearch-Button-Placeholder')).toHaveText('Search')
    await expect(page.locator('.VPDocAsideOutline .outline-title')).toHaveText('On this page')
    await expect(page.locator('.pm-view-menu--bar')).toHaveAttribute('aria-label', 'View')
    await expect(page.locator('.pm-section[data-section="global"]').getByRole('link', { name: 'Open in the slides' })).toHaveAttribute('href', /\/slides\/2$/)
    const input = await openSearch(page)
    await input.fill('nothing like this')
    await expect(page.locator('.VPLocalSearchBox')).toContainText('No results for')

    await page.goto(`${site()}?view=presenter&section=lifecycle`)
    await page.locator('.pm-presenter-panels summary').click()
    await expect(page.locator('[data-panel="presmium.core.start-report"] h3')).toHaveText('Start report')
    await expect(page.locator('.pm-start-report [data-plugin="fixture.core.lifecycle"]')).toHaveText('fixture.core.lifecycle started')
  })

  test('the presenter window reports the plugins that could not start and the component that failed; plugins are disposed when the page goes away', async ({ page }) => {
    await page.goto(`${site()}?view=presenter&section=lifecycle`)
    await page.locator('.pm-presenter-panels summary').click()
    const plugin = (id: string) => page.locator(`.pm-start-report [data-plugin="${id}"]`)
    await expect(plugin('fixture.core.future')).toHaveAttribute('data-status', 'disabled')
    await expect(plugin('fixture.core.future')).toContainText('kernel 0.1.0 does not satisfy "^9.0.0"')
    await expect(plugin('fixture.core.throws')).toHaveAttribute('data-status', 'failed')
    await expect(plugin('fixture.core.throws')).toContainText('fixture setup failed on purpose')
    for (const id of ['fixture.core.cycle-a', 'fixture.core.cycle-b']) {
      await expect(plugin(id)).toHaveAttribute('data-status', 'disabled')
      await expect(plugin(id)).toContainText('dependency cycle')
    }
    await expect(plugin('fixture.core.lifecycle')).toHaveAttribute('data-status', 'started')
    await expect(page.locator('.pm-component-errors [data-component="FixtureBroken"]')).toHaveText('FixtureBroken failed: fixture component failed on purpose')

    const disposals = () => page.evaluate(() => Number(localStorage.getItem('fixture.core.disposals') ?? 0))
    const before = await disposals()
    await page.reload()
    await expect.poll(disposals).toBe(before + 1)
  })

  test('on a phone a long deck title does not widen any page, and the classroom badge stays on screen', async ({ page, browser }) => {
    const paths = await webPages(page, site())
    expect(paths.length).toBeGreaterThan(1)
    const context = await phone(browser)
    const mobile = await context.newPage()
    await expectNoSidewaysScroll(mobile, deck.url, paths)
    await expect(mobile.locator('.VPNavBarTitle .title span')).toHaveCSS('text-overflow', 'ellipsis')

    // A join link without a name: the learner's badge asks for one.
    await mobile.goto(`${site()}?room=fixture-room`)
    const badge = mobile.getByRole('region', { name: '课堂状态' })
    await expect(badge).toBeInViewport({ ratio: 1 })
    await badge.getByRole('textbox').fill('Ada')
    await expect(badge.getByRole('textbox')).toHaveValue('Ada')
    const [scroll, client] = await mobile.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth])
    expect(scroll).toBeLessThanOrEqual(client)
    await context.close()
  })
})
