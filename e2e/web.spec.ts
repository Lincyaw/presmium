import { expect, test } from '@playwright/test'
import type { Browser, Locator, Page } from '@playwright/test'
import { fixtureDeck } from './fixtures/core/deck.ts'
import type { FixtureDeck } from './fixtures/core/deck.ts'
import { webDeck } from './fixtures/web/deck.ts'
import type { IRBlock, IRDocument, MdastNode, WebDeck } from './fixtures/web/deck.ts'
import { WEB } from './urls.ts'

// The web form (@presmium/web) of the reading fixture deck (e2e/fixtures/web/deck, built in
// beforeAll with its slides) and of the core fixture deck (e2e/fixtures/core/deck). Of the demo
// (examples/demo/dist/web on WEB) only what holds for any content is checked: every plugin
// component renders, and no page scrolls sideways on a phone.

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

/** The text of an element as the page shows it: drawn content left out, the heading anchor's zero-width space too. */
function shownText(locator: Locator): Promise<string[]> {
  return locator.evaluateAll((els, rich) => els.map((el) => {
    const textOf = (node: Node): string => node instanceof Element && node.matches(rich)
      ? ''
      : node.nodeType === Node.TEXT_NODE ? node.textContent ?? '' : [...node.childNodes].map(textOf).join('')
    return textOf(el).replace(/​/g, '')
  }), RICH)
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

test('every plugin component of the demo renders in the web form', async ({ page }) => {
  const doc = await (await page.request.get(`${WEB}/ir.json`)).json() as IRDocument
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
})

test('no page of the demo scrolls sideways on a 375 px wide phone', async ({ page, browser }) => {
  const paths = await webPages(page)
  const context = await phone(browser)
  await expectNoSidewaysScroll(await context.newPage(), WEB, paths)
  await context.close()
})

// e2e/fixtures/web/deck: the cover (index.html); chapter 1 is chapters/basics.md, which has no
// chapter title (basics.html); chapters 2 and 3 open with a chapter title each in chapters/advanced.md
// (advanced.html, wide-content.html). Sections `scrolly` and `wide` are hinted `web: { layout: scrolly }`.
test.describe('the reading fixture deck', () => {
  test.describe.configure({ mode: 'serial', timeout: 120_000 })
  let deck: WebDeck

  const CHAPTERS = [
    { path: '/web/', title: '网页阅读测试文稿', sections: ['cover'] },
    { path: '/web/basics.html', title: '阅读页面', sections: ['reading', 'scrolly'] },
    { path: '/web/advanced.html', title: '第二章 进阶', sections: ['advanced', 'stepper', 'steps', 'live-code'] },
    { path: '/web/wide-content.html', title: '第三章 宽内容', sections: ['wide-content', 'wide'] },
  ]

  test.beforeAll(async () => {
    test.setTimeout(300_000)
    deck = await webDeck('web,slides')
  })
  test.afterAll(() => deck?.close())

  test('a page per chapter shows its sections with their content and narration, without links from section to section', async ({ page }) => {
    for (const chapter of CHAPTERS) {
      await page.goto(`${deck.url}${chapter.path}`)
      const sections = page.locator('.pm-section')
      await expect(sections).toHaveCount(chapter.sections.length)
      expect(await sections.evaluateAll(els => els.map(el => (el as HTMLElement).dataset.section))).toEqual(chapter.sections)
      for (const id of chapter.sections) {
        const ir = deck.doc.sections.find(s => s.id === id)!
        const shown = page.locator(`.pm-section[data-section="${id}"]`)
        expect(words((await shownText(shown.locator('.pm-section__title')))[0]!), `heading of ${id}`).toBe(words(ir.title))
        const narration = ir.blocks.filter(b => b.role === 'narration').map(blockText).join('')
        expect(words((await shownText(shown.locator('.pm-block--narration'))).join('')), `narration of ${id}`).toBe(words(narration))
        const visual = words((await shownText(shown.locator('.pm-block--visual'))).join(''))
        for (const block of ir.blocks.filter(b => b.role === 'visual')) expect(visual, `block ${id}#${block.id}`).toContain(words(blockText(block)))
      }
      await expect(page.locator('.pm-section-nav, .pm-section a[rel="next"], .pm-section a[rel="prev"]')).toHaveCount(0)
    }

    // A chapter title heads its page; a chapter without one starts with its first section.
    await page.goto(deck.web('advanced.html'))
    await expect(page.locator('h1#advanced')).toContainText('第二章 进阶')
    await expect(page.locator('.pm-section[data-section="advanced"]')).toContainText('章首的讲解')
    await page.goto(deck.web('basics.html'))
    await expect(page.locator('h1')).toHaveCount(0)
    await expect(page.locator('h2#reading')).toBeVisible()

    // {only} limits blocks to renderers: the web shows its own, never the slides' ones.
    const reading = page.locator('.pm-section[data-section="reading"]')
    await expect(reading).toContainText('网页中才有的补充说明')
    await expect(reading).not.toContainText('幻灯片中才有的提示')
  })

  test('the end of a page links the chapters before and after it', async ({ page }) => {
    const prev = page.getByRole('link', { name: /^上一章/ })
    const next = page.getByRole('link', { name: /^下一章/ })
    await page.goto(deck.web())
    await expect(prev).toHaveCount(0)
    await expect(next).toContainText('阅读页面')

    await page.goto(deck.web('advanced.html'))
    await expect(prev).toContainText('阅读页面')
    await expect(prev).toHaveAttribute('href', '/web/basics.html')
    await expect(next).toContainText('第三章 宽内容')
    // Below the last section.
    const [footer, last] = await Promise.all([next.boundingBox(), page.locator('.pm-section').last().boundingBox()])
    expect(footer!.y).toBeGreaterThan(last!.y + last!.height)
    await next.click()
    await expect(page).toHaveURL(/\/web\/wide-content\.html$/)
    await expect(page.locator('h1#wide-content')).toBeInViewport()
    await expect(next).toHaveCount(0)
  })

  test('the sidebar lists the chapters, each with its sections; a section opens its page at its anchor', async ({ page }) => {
    await page.goto(deck.web('basics.html'))
    // A tree: the chapters, and under each its sections.
    const chapters = page.locator('.VPSidebar .VPSidebarItem.level-1')
    await expect(chapters).toHaveCount(CHAPTERS.length)
    for (const [i, chapter] of CHAPTERS.entries()) {
      const item = chapters.nth(i)
      await expect(item.locator(':scope > .item a')).toHaveText(chapter.title)
      await expect(item.locator(':scope > .item a')).toHaveAttribute('href', chapter.path)
      // The first section opens the chapter: the chapter's own entry.
      const titles = chapter.sections.slice(1).map(id => deck.doc.sections.find(s => s.id === id)!.title)
      await expect(item.locator('.VPSidebarItem.level-2 a')).toHaveText(titles)
    }
    await expect(page.locator('.VPSidebar .VPSidebarItem.level-3')).toHaveCount(0)

    await page.locator('.VPSidebar').getByRole('link', { name: '步骤作用域' }).click()
    await expect(page).toHaveURL(/\/web\/advanced\.html#steps$/)
    await expect(page.locator('h2#steps')).toBeInViewport()
    await page.locator('.VPSidebar').getByRole('link', { name: '第三章 宽内容' }).click()
    await expect(page).toHaveURL(/\/web\/wide-content\.html$/)
    await expect(page.locator('h1#wide-content')).toBeInViewport()
  })

  test('the page outline lists the sections of the chapter, also after moving to another page', async ({ page }) => {
    const outline = page.locator('.VPDocAsideOutline .VPDocOutlineItem.root > li > a')
    await page.goto(deck.web('advanced.html'))
    await expect(outline).toHaveText(['步进组件', '步骤作用域', '现场运行'])

    await page.locator('.VPSidebar').getByRole('link', { name: '阅读页面' }).click()
    await expect(page).toHaveURL(/\/web\/basics\.html$/)
    await expect(outline).toHaveText(['阅读页面', '滚动叙事'])
    await outline.nth(1).click()
    await expect(page.locator('h2#scrolly')).toBeInViewport()
  })

  test('what the slide shows stands on a board, apart from the narration, and keeps its formatting', async ({ page }) => {
    await page.goto(deck.web('basics.html'))
    const reading = page.locator('.pm-section[data-section="reading"]')
    // The slide's list and the code after it share one board.
    const boards = reading.locator('.pm-board')
    await expect(boards).toHaveCount(1)
    await expect(boards.locator('> .pm-block--visual')).toHaveCount(2)
    await expect(reading.locator('.pm-board .pm-block--narration')).toHaveCount(0)
    await expect(boards.locator('li')).toHaveCount(3)
    await expect(boards.locator('li strong')).toHaveText('上屏内容')

    const style = (locator: Locator) => locator.evaluate((el) => {
      const s = getComputedStyle(el)
      return { border: s.borderLeftWidth, background: s.backgroundColor }
    })
    const board = await style(boards)
    const narration = await style(reading.locator('.pm-block--narration').first())
    expect(board.border).toBe('4px')
    expect(board.background).not.toBe('rgba(0, 0, 0, 0)')
    expect(narration).toEqual({ border: '0px', background: 'rgba(0, 0, 0, 0)' })
  })

  test('code and tables on the stage of a scrolly section are not cut off', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(deck.web('wide-content.html'))
    const stage = page.locator('.pm-section--scrolly[data-section="wide"] .pm-stage')
    await expect(stage.locator('.pm-code .shiki')).toHaveCount(2)
    const boxes = await stage.locator('pre, table').evaluateAll(els => els.map((el) => {
      const stage = el.closest('.pm-stage')!.getBoundingClientRect()
      const box = el.getBoundingClientRect()
      return { tag: el.tagName, inside: box.left >= stage.left && box.right <= stage.right, fits: el.scrollWidth <= el.clientWidth, scrolls: ['auto', 'scroll'].includes(getComputedStyle(el).overflowX) }
    }))
    expect(boxes.map(b => b.tag)).toEqual(['PRE', 'PRE', 'TABLE'])
    // Every listing and table stays inside the stage; it fits, or it scrolls sideways.
    for (const box of boxes) expect(box.inside && (box.fits || box.scrolls), JSON.stringify(box)).toBe(true)
    // The code shrinks to the stage's width; a line too long even then scrolls, and the end of it can be read.
    expect(boxes[0]!.fits).toBe(true)
    expect(boxes[1]!.fits).toBe(false)
    const long = stage.locator('pre').nth(1)
    await long.evaluate((el) => {
      el.scrollLeft = el.scrollWidth
    })
    await expect.poll(() => long.evaluate(el => Math.round(el.scrollLeft + el.clientWidth) >= el.scrollWidth - 1)).toBe(true)
  })

  test('a Chinese keyword is found within 300 ms and opens its section', async ({ page }) => {
    await page.goto(deck.web())
    const input = await openSearch(page)
    // The first query loads the index; time later ones. The time includes VitePress's 200 ms input debounce.
    await input.fill('网页')
    await expect(results(page).first()).toBeVisible()
    // The fastest of three, so that a moment of load on the machine does not count.
    const times: number[] = []
    for (let i = 0; i < 3 && !times.some(t => t < 300); i++) {
      await input.fill('')
      await expect(results(page)).toHaveCount(0)
      times.push(await timeSearch(page, '讲稿即正文'))
    }
    expect(Math.min(...times)).toBeLessThan(300)
    await results(page).first().click()
    await expect(page).toHaveURL(/\/web\/basics\.html#reading$/)
    await expect(page.locator('h2#reading')).toBeInViewport()
  })

  test('a section title alone finds its section, under its chapter', async ({ page }) => {
    await page.goto(deck.web('advanced.html'))
    const input = await openSearch(page)
    await input.fill('滚动叙事')
    const first = results(page).first()
    await expect(first.locator('.title.main')).toContainText('滚动叙事')
    await first.click()
    await expect(page).toHaveURL(/\/web\/basics\.html#scrolly$/)
    await expect(page.locator('h2#scrolly')).toBeInViewport()

    await openSearch(page)
    await input.fill('步骤作用域')
    await expect(results(page).first().getByRole('link')).toHaveAttribute('aria-label', '第二章 进阶 > 步骤作用域')
  })

  test('search keeps working offline once the site has loaded', async ({ page, context }) => {
    await page.goto(deck.web())
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined))
    await context.setOffline(true)
    expect((await page.reload())?.fromServiceWorker()).toBe(true)
    const input = await openSearch(page)
    // Code is indexed too.
    await input.fill('createViewer')
    await results(page).first().click()
    await expect(page.locator('h2#reading')).toBeInViewport()
    await expect(page.locator('.pm-section[data-section="reading"] .pm-code')).toContainText('createViewer')
    await context.setOffline(false)
  })

  test('no page scrolls sideways on a 375 px wide phone', async ({ page, browser }) => {
    const paths = await webPages(page, deck.web())
    expect(paths).toHaveLength(CHAPTERS.length)
    const context = await phone(browser)
    await expectNoSidewaysScroll(await context.newPage(), deck.url, paths)
    await context.close()
  })

  test('pages reflow at 200 % and 400 % zoom and follow the reader\'s font size', async ({ page, browser }) => {
    const paths = await webPages(page, deck.web())
    // 200 %: 640 CSS px on a 1280 px wide screen; 400 %: 320 CSS px.
    for (const options of [{ viewport: { width: 640, height: 400 }, deviceScaleFactor: 2 }, { viewport: { width: 320, height: 256 } }]) {
      const context = await browser.newContext(options)
      await expectNoSidewaysScroll(await context.newPage(), deck.url, paths)
      await context.close()
    }

    // The browser's default font size (a Chromium setting) sizes the text.
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Page.setFontSizes', { fontSizes: { standard: 24 } })
    await page.goto(deck.web('basics.html'))
    const size = (selector: string) => page.locator(selector).first().evaluate(el => getComputedStyle(el).fontSize)
    expect(await size('html')).toBe('24px')
    expect(await size('body')).toBe('24px')
  })

  test('a scrollytelling section advances its steps with the narration, and back', async ({ page }) => {
    await page.goto(deck.web('basics.html'))
    const section = page.locator('.pm-section--scrolly[data-section="scrolly"]')
    const items = section.locator('.pm-stage li')
    const stepper = section.locator('.pm-block[data-component="FixtureStepper"]')
    const scrollTo = (step: number) => section.locator(`.pm-step[data-step="${step}"]`).evaluate(el => el.scrollIntoView({ block: 'center' }))

    await expect(section).toHaveAttribute('data-step', '0')
    await expect(items.nth(0)).toBeVisible()
    await expect(items.nth(1)).toBeHidden()

    await scrollTo(2)
    await expect(section).toHaveAttribute('data-step', '2')
    await expect(items.nth(2)).toBeVisible()
    await expect(stepper).toBeVisible()
    await expect(stepper.locator('.fx-stepper')).toHaveAttribute('data-step', '0')
    await expect(section.locator('.pm-stage')).toBeInViewport()

    await scrollTo(3)
    await expect(section).toHaveAttribute('data-step', '3')
    await expect(stepper.locator('.fx-stepper')).toHaveAttribute('data-step', '1')
    await expect(stepper.locator('li').nth(1)).toBeHidden()

    await scrollTo(1)
    await expect(section).toHaveAttribute('data-step', '1')
    await expect(items.nth(2)).toBeHidden()
    await expect(stepper).toBeHidden()
  })

  test('a small link beside each section heading opens its slide at the step read; the slides open the section back', async ({ page }) => {
    const index = deck.slide('reading')
    await page.goto(deck.web('basics.html'))
    const reading = page.locator('.pm-section[data-section="reading"]')
    const link = reading.locator('h2').getByRole('link', { name: '在幻灯片中打开' })
    expect(new URL((await link.getAttribute('href'))!).pathname).toBe(`/slides/${index}`)
    // Beside the title, which stays the heading's text (the outline shows it).
    const [title, entry] = await Promise.all([reading.locator('h2').boundingBox(), link.boundingBox()])
    expect(entry!.y).toBeLessThan(title!.y + title!.height)
    expect((await shownText(reading.locator('h2')))[0]).toBe('阅读页面')
    const scrolly = page.locator('.pm-section[data-section="scrolly"]')
    await scrolly.locator('.pm-step[data-step="2"]').evaluate(el => el.scrollIntoView({ block: 'center' }))
    await expect(scrolly).toHaveAttribute('data-step', '2')
    const atStep = new URL((await scrolly.getByRole('link', { name: '在幻灯片中打开' }).getAttribute('href'))!)
    expect(`${atStep.pathname}${atStep.search}`).toBe(`/slides/${index + 1}?clicks=2`)

    // The built slides show the slide, and their "read on the web" opens the section.
    await page.goto(deck.slides(String(index)))
    await expect(page.locator(`.slidev-page-${index}`)).toContainText('上屏内容')
    const toWeb = page.getByRole('link', { name: '在网页中阅读' })
    await expect(toWeb).toHaveAttribute('href', new RegExp(`/web/\\?slide=${index}$`))
    await page.goto((await toWeb.getAttribute('href'))!)
    await expect(page).toHaveURL(/\/web\/basics\.html/)
    await expect(page.locator('h2#reading')).toBeInViewport()

    // `?section=<id>&step=<n>` opens a section at a step.
    await page.goto(deck.web('?section=scrolly&step=2'))
    await expect(scrolly).toHaveAttribute('data-step', '2')
    await expect(scrolly.locator('.pm-step[data-step="2"]')).toBeInViewport()
  })

  test('without any deck configuration the slides offer "read on the web", which opens slide N at step S', async ({ page }) => {
    // The deck configures no addon for the button: the slides renderer adds it because the deck has a web form.
    expect(deck.doc.config.renderers.slides?.addons).toBeUndefined()
    const index = deck.slide('scrolly')
    await page.goto(deck.slides(`${index}?clicks=2`))
    await expect(page.locator(`.slidev-page-${index}`)).toContainText('编译')
    // The link follows the step once Slidev has applied `?clicks=`.
    const link = page.getByRole('link', { name: '在网页中阅读' })
    await expect(link).toHaveAttribute('href', new RegExp(`\\?slide=${index}&step=2$`))
    await page.goto((await link.getAttribute('href'))!)
    await expect(page).toHaveURL(/\/web\/basics\.html/)
    const scrolly = page.locator('.pm-section[data-section="scrolly"]')
    await expect(scrolly).toHaveAttribute('data-step', '2')
    await expect(scrolly.locator('.pm-step[data-step="2"]')).toBeInViewport()
  })

  test('a component counts its steps from its block in the web form too', async ({ page }) => {
    // In the present view, the stepper of `stepper` (at step 0) at step 1 and the one of `steps` (at step 2) at step 3.
    const stepper = async (section: string, step: number) => {
      await page.goto(deck.web(`advanced.html?view=present&section=${section}&step=${step}`))
      const present = page.getByRole('region', { name: '放映' })
      await expect(present).toHaveAttribute('data-step', String(step))
      const shown = present.locator('.fx-stepper')
      await expect(shown).toHaveAttribute('data-step', '1')
      await expect(shown.locator('li[data-status="active"]')).toHaveText('解析文稿')
      await expect(shown.locator('li').nth(1)).toBeHidden()
      return shown.innerHTML()
    }
    expect(await stepper('steps', 3)).toBe(await stepper('stepper', 1))
    // The document view shows every step: the last state.
    await page.goto(deck.web('advanced.html'))
    await expect(page.locator('.pm-section[data-section="stepper"] .fx-stepper')).toHaveAttribute('data-step', '3')
  })

  test('a zh-CN deck speaks Chinese around the content: skip link, appearance switch, chapter links, 404 page', async ({ page }) => {
    await page.goto(deck.web('basics.html'))
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')
    await expect(page.locator('.VPSkipLink')).toHaveText('跳到正文')
    await expect(page.locator('.VPNavBar .VPSwitchAppearance').filter({ visible: true })).toHaveAttribute('title', /^切换到(深色|浅色)模式$/)
    await expect(page.locator('.VPDocFooter .pager-link .desc')).toHaveText(['上一章', '下一章'])

    await page.goto(deck.web('no-such-page.html'))
    await expect(page.locator('.NotFound')).toContainText('页面不存在')
    await expect(page.locator('.NotFound').getByRole('link')).toHaveText('返回首页')
  })
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

  test('two windows of the deck share a plugin state, and a window opened later gets it', async ({ context }) => {
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

    const late = await context.newPage()
    await late.goto(`${site()}?view=presenter&section=shared`)
    await expect(late.locator('.fx-shared output').first()).toHaveText('2')
  })

  test('a remote plugin state goes to the other devices through the sync transports, and comes back from them', async ({ page }) => {
    await page.goto(site())
    const remote = page.locator('.pm-section[data-section="shared"] .fx-remote')
    await remote.getByRole('button', { name: 'Count on every device' }).click()
    await expect(remote.locator('output')).toHaveText('1')
    await expect.poll(() => page.evaluate(() => window.fixtureDevice?.published.at(-1))).toEqual({ value: 1, fromRemote: false })
    await page.evaluate(() => window.fixtureDevice!.receive({ value: 5 }))
    await expect(remote.locator('output')).toHaveText('5')
  })

  test('an en-US deck sets <html lang> and speaks English: the VitePress chrome, the links to the slides, the start report', async ({ page }) => {
    await page.goto(site())
    await expect(page.locator('html')).toHaveAttribute('lang', 'en-US')
    await expect(page.locator('.DocSearch-Button-Placeholder')).toHaveText('Search')
    await expect(page.locator('.VPDocAsideOutline .outline-title')).toHaveText('On this page')
    await expect(page.locator('.pm-view-menu--bar')).toHaveAttribute('aria-label', 'View')
    await expect(page.locator('.pm-section[data-section="global"]').getByRole('link', { name: 'Open in the slides' })).toHaveAttribute('href', /\/slides\/2$/)
    await expect(page.getByRole('link', { name: /^Next chapter/ })).toBeVisible()
    const input = await openSearch(page)
    await input.fill('nothing like this')
    await expect(page.locator('.VPLocalSearchBox')).toContainText('No results for')

    await page.goto(`${site()}?view=presenter&section=lifecycle`)
    await page.locator('.pm-presenter-panels summary').click()
    await expect(page.locator('[data-panel="presmium.core.start-report"] h3')).toHaveText('Start report')
    await expect(page.locator('.pm-start-report [data-plugin="fixture.core.lifecycle"]')).toHaveText('fixture.core.lifecycle started')
    expect(await page.evaluate(() => window.fixtureLang)).toBe('en-US')
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

  test('the plugins start in the web form as in the slides: the start reports agree', async ({ page }) => {
    // The start report is a presenter panel in both forms: the presenter window of the web form, the presenter view of the slides.
    const plugins = async () => {
      await page.locator('.pm-presenter-panels summary').click()
      await expect(page.locator('.pm-start-report [data-plugin="fixture.core.lifecycle"]')).toBeVisible()
      const items = page.locator('.pm-start-report [data-plugin^="fixture.core."]')
      return Object.fromEntries(await items.evaluateAll(list => list.map(li => [(li as HTMLElement).dataset.plugin, (li as HTMLElement).dataset.status])))
    }
    await page.goto(`${site()}?view=presenter&section=lifecycle`)
    const web = await plugins()
    expect(web['fixture.core.lifecycle']).toBe('started')
    await page.goto(`${deck.url}/slides/presenter/${deck.slide('lifecycle')}`)
    expect(await plugins()).toEqual(web)
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
    const badge = mobile.getByRole('region', { name: 'Classroom status' }) // an en-US deck
    await expect(badge).toBeInViewport({ ratio: 1 })
    await badge.getByRole('textbox').fill('Ada')
    await expect(badge.getByRole('textbox')).toHaveValue('Ada')
    const [scroll, client] = await mobile.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth])
    expect(scroll).toBeLessThanOrEqual(client)
    await context.close()
  })
})
