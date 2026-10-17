import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import type { BrowserContext, Page } from '@playwright/test'
import { buildFixture, deckDir, openDevPage, serve, startDev } from './fixtures/deck.ts'
import type { DevServer, FixtureDeck } from './fixtures/deck.ts'
import { webDeck } from './fixtures/web/deck.ts'
import type { WebDeck } from './fixtures/web/deck.ts'

// The IR runtime (@presmium/viewer) in the web form of the fixture decks: the reading deck of
// e2e/fixtures/web/deck (cover; basics.html with `reading` and the scrolly section `scrolly`;
// advanced.html with steppers, a run panel and a diagram, and live code; wide-content.html), the
// decks under e2e/fixtures/viewer, and `presmium dev` on e2e/fixtures/viewer/dev.

declare global {
  interface Window {
    /** The names of the BroadcastChannels the page has opened (`recordChannels`). */
    channelNames?: string[]
  }
}

const menu = (page: Page) => page.getByRole('combobox', { name: '视图' })

/** Waits until the page view has scrolled to the position kept across a view switch. */
async function settled(page: Page) {
  await expect(page.locator('.pm-view-host')).not.toHaveAttribute('aria-busy', 'true')
}

async function selectView(page: Page, view: string) {
  await menu(page).selectOption(view)
  if (view !== 'present') await settled(page)
}

/** Scrolls the narration of a step of a scrolly section to the middle of the screen. */
async function scrollToStep(page: Page, section: string, step: number) {
  const target = page.locator(`.pm-section[data-section="${section}"]`)
  await expect(async () => {
    await target.locator(`.pm-step[data-step="${step}"]`).evaluate(el => el.scrollIntoView({ block: 'center' }))
    await expect(target).toHaveAttribute('data-step', String(step), { timeout: 500 })
  }).toPass()
}

/** Records the name of every BroadcastChannel the pages of `context` open, in `window.channelNames`. */
async function recordChannels(context: BrowserContext) {
  await context.addInitScript(() => {
    const names: string[] = []
    window.channelNames = names
    const Native = BroadcastChannel
    window.BroadcastChannel = class extends Native {
      constructor(name: string) {
        super(name)
        names.push(name)
      }
    }
  })
}

/** Whether two boxes overlap. */
function overlap(a: { x: number, y: number, width: number, height: number }, b: typeof a): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}

test.describe('the reading fixture deck', () => {
  test.describe.configure({ mode: 'serial', timeout: 120_000 })
  let deck: WebDeck
  test.beforeAll(async () => {
    test.setTimeout(300_000)
    deck = await webDeck('web')
  })
  test.afterAll(() => deck?.close())

  test('switching between the document, scrolly and present views keeps the section and the step', async ({ page }) => {
    await page.goto(deck.web('basics.html'))
    await scrollToStep(page, 'scrolly', 2)

    await selectView(page, 'present')
    const present = page.getByRole('region', { name: '放映' })
    await expect(present).toHaveAttribute('data-section', 'scrolly')
    await expect(present).toHaveAttribute('data-step', '2')
    await expect(present.locator('li', { hasText: '发布' })).toBeVisible()

    // Leaving the present view goes back to the page view it came from, at the same place.
    await page.keyboard.press('Escape')
    await expect(present).toHaveCount(0)
    await expect(menu(page)).toHaveValue('document')
    await settled(page)
    const scrolly = page.locator('.pm-section[data-section="scrolly"]')
    await expect(scrolly).toHaveAttribute('data-step', '2')
    await expect(scrolly.locator('.pm-step[data-step="2"]')).toBeInViewport()

    // The scrolly view lays out every section that way; the position stays.
    await selectView(page, 'scrolly')
    await expect(page.locator('.pm-section[data-section="reading"]')).toHaveClass(/pm-section--scrolly/)
    await expect(scrolly).toHaveAttribute('data-step', '2')
    await expect(scrolly.locator('.pm-step[data-step="2"]')).toBeInViewport()
    await scrollToStep(page, 'scrolly', 3)
    await selectView(page, 'present')
    await expect(present).toHaveAttribute('data-step', '3')

    // A section on another page: leaving the present view goes to its page, still in the scrolly view.
    await page.keyboard.press('End')
    await expect(present).toHaveAttribute('data-section', 'wide')
    await page.getByRole('button', { name: '退出放映' }).click()
    await expect(page).toHaveURL(/\/web\/wide-content\.html/)
    await expect(menu(page)).toHaveValue('scrolly')
    await settled(page)
    await expect(page.locator('h2#wide')).toBeInViewport()
  })

  test('the present view pages with the keyboard; the presenter window follows with the narration of the step', async ({ page }) => {
    // `?view=` opens a view at the page's own section.
    await page.goto(deck.web('basics.html?view=present'))
    const present = page.getByRole('region', { name: '放映' })
    await expect(present).toHaveAttribute('data-section', 'reading')
    await page.keyboard.press('ArrowRight')
    await expect(present).toHaveAttribute('data-section', 'scrolly')
    await expect(present).toHaveAttribute('data-step', '0')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    // The stepper appears at step 2 and steps through its own states from there.
    const stepper = present.locator('.fx-stepper')
    await expect(present).toHaveAttribute('data-step', '2')
    await expect(stepper).toHaveAttribute('data-step', '0')
    await page.keyboard.press('ArrowRight')
    await expect(present).toHaveAttribute('data-step', '3')
    await expect(stepper).toHaveAttribute('data-step', '1')
    await expect(stepper.locator('li').nth(1)).toBeHidden()
    // Narration is not on the screen.
    await expect(present).not.toContainText('先是离线缓存')

    const [presenter] = await Promise.all([page.waitForEvent('popup'), present.getByRole('button', { name: '演讲者窗口' }).click()])
    const notes = presenter.locator('.pm-presenter')
    await expect(notes).toHaveAttribute('data-step', '3')
    // The current screen shows what the audience sees at this step, under the section's title.
    await expect(notes.locator('.pm-presenter__slide .fx-stepper')).toHaveAttribute('data-step', '1')
    await expect(notes.locator('.pm-presenter__slide .pm-present__title')).toHaveText('滚动叙事')
    await expect(notes.locator('.pm-presenter__slide')).not.toContainText('先是离线缓存')
    await expect(notes.locator('.pm-current')).toContainText('先是离线缓存')
    await expect(notes.locator('.pm-presenter__next')).toContainText('然后是形态互跳')
    await expect(notes.locator('.pm-presenter__timer')).toHaveText(/^\d\d:\d\d$/)

    // Either window moves both.
    await page.keyboard.press('ArrowRight')
    await expect(notes).toHaveAttribute('data-step', '4')
    await expect(notes.locator('.pm-current')).toContainText('然后是形态互跳')
    await expect(stepper.locator('li').nth(1)).toBeVisible()
    for (let i = 0; i < 5; i++) await presenter.keyboard.press('ArrowLeft')
    await expect(present).toHaveAttribute('data-section', 'reading')
    await presenter.keyboard.press('ArrowRight')
    await expect(present).toHaveAttribute('data-section', 'scrolly')
    await expect(present).toHaveAttribute('data-step', '0')
  })

  test('the counters count steps from 1 and leave out a section without steps; the presenter panels stand beside the preview', async ({ page }) => {
    const scrolly = deck.doc.sections.find(s => s.id === 'scrolly')!
    const total = deck.doc.sections.length
    await page.goto(deck.web('basics.html?view=present'))
    const counter = page.locator('.pm-present__counter')
    // `reading` has no steps.
    await expect(counter).toHaveText(`2 / ${total}`)
    await page.keyboard.press('ArrowRight')
    await expect(counter).toHaveText(`3 / ${total} · 第 1 步，共 ${scrolly.steps + 1} 步`)
    for (let step = 0; step < scrolly.steps; step++) await page.keyboard.press('ArrowRight')
    await expect(counter).toHaveText(`3 / ${total} · 第 ${scrolly.steps + 1} 步，共 ${scrolly.steps + 1} 步`)

    const [presenter] = await Promise.all([page.waitForEvent('popup'), page.keyboard.press('p')])
    await expect(presenter.locator('.pm-presenter__counter')).toHaveText(`第 ${scrolly.steps + 1} 步，共 ${scrolly.steps + 1} 步`)
    const panels = presenter.locator('.pm-presenter-panels')
    await expect(panels.locator('summary')).toContainText('课堂与工具')
    await panels.locator('summary').click()
    await expect(panels.locator('[data-panel="presmium.core.start-report"]')).toBeVisible()
    const [box, preview] = await Promise.all([panels.boundingBox(), presenter.locator('.pm-presenter__slide').boundingBox()])
    expect(overlap(box!, preview!)).toBe(false)
  })

  test('the overview of the present view lists every section; Enter or a click jumps there', async ({ page }) => {
    await page.goto(deck.web('basics.html?view=present'))
    const present = page.getByRole('region', { name: '放映' })
    await expect(present).toHaveAttribute('data-section', 'reading')
    await page.keyboard.press('o')
    const overview = present.getByRole('dialog', { name: '总览' })
    await expect(overview.getByRole('button')).toHaveCount(deck.doc.sections.length)
    // The current section has the focus; the arrow keys move it, Enter jumps.
    await expect(overview.locator('[aria-current="true"]')).toBeFocused()
    await page.keyboard.press('ArrowRight')
    await expect(overview.locator('[data-section="scrolly"]')).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(overview).toHaveCount(0)
    await expect(present).toHaveAttribute('data-section', 'scrolly')
    await expect(present).toHaveAttribute('data-step', '0')

    await present.getByRole('button', { name: '总览' }).click()
    await overview.locator('[data-section="stepper"]').click()
    await expect(present).toHaveAttribute('data-section', 'stepper')
    // Escape closes the overview, not the present view.
    await page.keyboard.press('o')
    await page.keyboard.press('Escape')
    await expect(overview).toHaveCount(0)
    await expect(present).toBeVisible()
  })

  test('the full screen button puts the present view in full screen', async ({ page }) => {
    await page.addInitScript(() => {
      Element.prototype.requestFullscreen = function (this: Element) {
        (window as { fullscreen?: string }).fullscreen = this.className
        return Promise.resolve()
      }
    })
    await page.goto(deck.web('basics.html?view=present'))
    await page.getByRole('region', { name: '放映' }).getByRole('button', { name: '全屏' }).click()
    await expect.poll(() => page.evaluate(() => (window as { fullscreen?: string }).fullscreen)).toBe('pm-present')
  })

  test('a reload keeps the present view and the presenter window at their section and step (P-77)', async ({ page }) => {
    await page.goto(deck.web('basics.html?view=present'))
    const present = page.getByRole('region', { name: '放映' })
    await expect(present).toHaveAttribute('data-section', 'reading')
    // A section of another page, at a step of its own.
    await page.keyboard.press('End')
    await expect(present).toHaveAttribute('data-section', 'wide')
    await page.keyboard.press('ArrowLeft')
    const { section, step } = await present.evaluate(el => ({ section: (el as HTMLElement).dataset.section, step: (el as HTMLElement).dataset.step }))
    await page.reload()
    await expect(present).toHaveAttribute('data-section', section!)
    await expect(present).toHaveAttribute('data-step', step!)

    const [presenter] = await Promise.all([page.waitForEvent('popup'), page.keyboard.press('p')])
    const notes = presenter.locator('.pm-presenter')
    await expect(notes).toHaveAttribute('data-section', section!)
    await presenter.keyboard.press('ArrowLeft')
    const moved = await notes.evaluate(el => ({ section: (el as HTMLElement).dataset.section, step: (el as HTMLElement).dataset.step }))
    await presenter.reload()
    await expect(notes).toHaveAttribute('data-section', moved.section!)
    await expect(notes).toHaveAttribute('data-step', moved.step!)
    // Back in the page view, the address names no view.
    await page.keyboard.press('Escape')
    await expect(page).not.toHaveURL(/view=/)
  })

  test('a link to a section below content that loads late opens it at the top of the screen; the present view starts there', async ({ page }) => {
    await page.goto(deck.web('advanced.html#live-code'))
    // The run panel and the diagram above it render in the browser, after the page has loaded.
    await expect(page.locator('.pm-section[data-section="panel"] .pm-mermaid[data-rendered]')).toBeAttached()
    await expect(page.locator('.pm-section[data-section="panel"] .pm-client-only')).toHaveCount(0)
    const heading = page.locator('h2#live-code')
    await expect.poll(async () => Math.round((await heading.boundingBox())!.y), { timeout: 10_000 }).toBeLessThan(120)
    await expect(heading).toBeInViewport()
    await selectView(page, 'present')
    await expect(page.getByRole('region', { name: '放映' })).toHaveAttribute('data-section', 'live-code')
  })

  test('after two reloads, code that also runs live still runs in the browser', async ({ page }) => {
    await page.goto(deck.web('advanced.html'))
    await page.reload()
    await page.reload()
    const block = page.locator('.pm-section[data-section="live-code"] .pm-code-block[data-run="both"]')
    // The output recorded at compile time first.
    await expect(block.locator('.pm-outputs')).toHaveAttribute('data-source', 'recorded')
    await expect(block.getByRole('button', { name: '运行' })).toBeEnabled()
    await block.getByRole('button', { name: '运行' }).click()
    await expect(block.locator('.pm-outputs')).toHaveAttribute('data-source', 'live', { timeout: 30_000 })
    await expect(block.locator('.pm-output__stdout')).toContainText('合计： 55')
  })

  test('keyboard focus stays in the present view and returns to the view menu after Escape', async ({ page }) => {
    await page.goto(deck.web('basics.html'))
    await menu(page).focus()
    await menu(page).selectOption('present')
    const present = page.getByRole('region', { name: '放映' })
    await expect(present).toBeFocused()
    const inside = () => page.evaluate(() => Boolean(document.activeElement?.closest('.pm-present')))
    // More Tab presses than the view has controls: focus cycles inside, never into the page behind.
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab')
      expect(await inside()).toBe(true)
    }
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('Shift+Tab')
      expect(await inside()).toBe(true)
    }
    expect(await page.evaluate(() => document.querySelector('.VPNav')?.closest('[inert]') !== null)).toBe(true)
    await page.keyboard.press('ArrowRight')
    await expect(present).toHaveAttribute('data-section', 'scrolly')
    await page.keyboard.press('Escape')
    await expect(present).toHaveCount(0)
    await expect(menu(page)).toBeFocused()
    expect(await page.locator('[inert]').count()).toBe(0)
  })

  test('the present view fits every section to the screen at the usual projector resolutions, wide code and tables too', async ({ page }) => {
    test.setTimeout(300_000)
    const { sections } = deck.doc
    // Whether the slide's content reaches past its frame, which would cut it off, or a listing or a table of it scrolls.
    const overflows = () => page.locator('.pm-present__slide').evaluate((frame) => {
      const content = frame.querySelector('.pm-present__content')!.getBoundingClientRect()
      const box = frame.getBoundingClientRect()
      const scrolls = [...frame.querySelectorAll('pre, table')].some(el => el.scrollWidth > el.clientWidth + 1)
      return scrolls || frame.scrollHeight > frame.clientHeight + 1 || frame.scrollWidth > frame.clientWidth + 1 || content.bottom > box.bottom + 1
    })
    const present = page.getByRole('region', { name: '放映' })
    for (const [width, height] of [[1920, 1080], [1440, 900], [1366, 768], [1280, 720], [1280, 800], [1024, 768]] as const) {
      await page.setViewportSize({ width, height })
      await page.goto(deck.web('?view=present'))
      // Every section at its first and its last step, paging on from one section to the next.
      for (const section of sections) {
        await expect(present).toHaveAttribute('data-section', section.id)
        await expect.poll(overflows, { message: `${section.id} at ${width}x${height}` }).toBe(false)
        for (let step = 0; step < section.steps; step++) await page.keyboard.press('ArrowRight')
        await expect(present).toHaveAttribute('data-step', String(section.steps))
        await expect.poll(overflows, { message: `${section.id}, last step, at ${width}x${height}` }).toBe(false)
        await page.keyboard.press('ArrowRight')
      }
    }
  })

  test('the present view keeps the numbers of a list on the slide, at the slide\'s type size', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(deck.web('advanced.html?view=present'))
    const present = page.getByRole('region', { name: '放映' })
    await expect(present).toHaveAttribute('data-section', 'advanced')
    const list = present.locator('.pm-present__slide ol')
    await expect(list.locator('li')).toHaveCount(4)
    // Where the first item's marker starts: as far before the item as the marker is wide, which is
    // how far a marker inside an item of a list beside it moves the item's text. The block and the
    // slide frame clip what reaches before them.
    const { marker, block, frame } = await list.evaluate((ol) => {
      const probe = document.createElement('ol')
      probe.style.cssText = 'list-style-position: inside; margin: 0; padding: 0'
      probe.innerHTML = '<li><span>x</span></li>'
      ol.after(probe)
      const width = probe.querySelector('span')!.getBoundingClientRect().left - probe.getBoundingClientRect().left
      probe.remove()
      const left = (selector: string) => ol.closest(selector)!.getBoundingClientRect().left
      return { marker: ol.querySelector('li')!.getBoundingClientRect().left - width, block: left('.pm-block'), frame: left('.pm-present__slide') }
    })
    expect(marker).toBeGreaterThanOrEqual(block)
    expect(marker).toBeGreaterThanOrEqual(frame)
  })

  test('the windows of a presentation share a channel of this deck: its name carries the base', async ({ context }) => {
    await recordChannels(context)
    const page = await context.newPage()
    await page.goto(deck.web('basics.html?view=present'))
    await expect(page.getByRole('region', { name: '放映' })).toHaveAttribute('data-section', 'reading')
    await expect.poll(() => page.evaluate(() => window.channelNames ?? [])).toContain('presmium.viewer.position:网页阅读测试文稿 @ /web/')
  })
})

test.describe('two decks of the same title under two bases of one origin (e2e/fixtures/viewer/en)', () => {
  test.describe.configure({ mode: 'serial', timeout: 120_000 })
  const decks: FixtureDeck[] = []
  let site: Awaited<ReturnType<typeof serve>>
  let root: string
  test.beforeAll(async () => {
    test.setTimeout(300_000)
    const base = (path: string) => (dir: string) => {
      const file = join(dir, 'lecture.md')
      writeFileSync(file, readFileSync(file, 'utf8').replace('  web: {}', `  web: { base: ${path} }`))
    }
    decks.push(...await Promise.all(['/a/', '/b/'].map(path => buildFixture('viewer/en', { to: 'web', edit: base(path) }))))
    root = deckDir('bases')
    symlinkSync(join(decks[0]!.dir, 'dist/web'), join(root, 'a'), 'junction')
    symlinkSync(join(decks[1]!.dir, 'dist/web'), join(root, 'b'), 'junction')
    site = await serve(root)
  })
  test.afterAll(async () => {
    await site?.close()
    await Promise.all(decks.map(deck => deck.close()))
    if (root) rmSync(root, { recursive: true, force: true })
  })

  test('paging or blacking out one leaves the other as it is', async ({ context }) => {
    const [a, b] = [await context.newPage(), await context.newPage()]
    for (const [page, path] of [[a, 'a'], [b, 'b']] as const) {
      await page.goto(`${site.url}/${path}/?view=present&section=steps`)
      await expect(page.getByRole('region', { name: 'Presentation' })).toHaveAttribute('data-step', '0')
    }
    await a.keyboard.press('ArrowRight')
    await a.keyboard.press('b')
    await expect(a.getByRole('region', { name: 'Presentation' })).toHaveAttribute('data-step', '1')
    await expect(a.locator('.pm-stage-black')).toBeVisible()
    // Time for a message to arrive, were there one.
    await b.waitForTimeout(500)
    await expect(b.getByRole('region', { name: 'Presentation' })).toHaveAttribute('data-step', '0')
    await expect(b.locator('.pm-stage-black')).toHaveCount(0)
  })
})

/** Console messages of a page that report a hydration mismatch. */
function hydrationMismatches(page: Page): string[] {
  const found: string[] = []
  page.on('console', (message) => {
    if (/hydration/i.test(message.text()) && /mismatch/i.test(message.text())) found.push(message.text())
  })
  return found
}

test.describe('MyST roles and directives, raw HTML and code origins (e2e/fixtures/viewer/myst)', () => {
  test.describe.configure({ mode: 'serial', timeout: 120_000 })
  let site: FixtureDeck
  test.beforeAll(async () => {
    test.setTimeout(300_000)
    site = await buildFixture('viewer/myst', { to: 'web' })
  })
  test.afterAll(() => site?.close())

  test('render as their HTML elements, and the page hydrates without a mismatch', async ({ page }) => {
    const mismatches = hydrationMismatches(page)
    await page.goto(site.web)
    const roles = page.locator('.pm-section[data-section="myst-roles"]')
    await expect(roles.locator('p kbd')).toHaveText(['Ctrl', 'K'])
    await expect(roles.locator('p sub')).toHaveText('2')
    await expect(roles.locator('p sup')).toHaveText('2')
    await expect(roles.locator('p abbr')).toHaveAttribute('title', 'intermediate representation')
    // Inline content stays inside its paragraph.
    await expect(page.locator('.pm-section p div')).toHaveCount(0)
    await expect(roles.locator('p', { hasText: '打开搜索' })).toHaveCount(1)
    // A reference without text shows its target section's title.
    await expect(roles.getByRole('link', { name: '指令', exact: true })).toHaveAttribute('href', /#myst-directives$/)
    await expect(roles.getByRole('link', { name: '角色', exact: true })).toHaveAttribute('href', /#myst-roles$/)

    const directives = page.locator('.pm-section[data-section="myst-directives"]')
    await expect(directives.locator('dl > dt')).toHaveText(['讲台', '听众视图'])
    await expect(directives.locator('dl > dd')).toHaveText(['放映时演讲者所在的位置。', '投影给听众看的画面。'])
    const details = directives.locator('details')
    await expect(details.locator('summary')).toHaveText('展开细节')
    await expect(details.getByText('折叠起来的补充说明')).toBeHidden()
    await details.locator('summary').click()
    await expect(details.getByText('折叠起来的补充说明')).toBeVisible()
    await expect(directives.locator('aside.pm-admonition--tip.tip')).toContainText('带类的提示框')
    await expect(directives.locator('aside.pm-admonition--note.pm-fixture-note')).toContainText('普通的注意事项')

    await page.waitForLoadState('networkidle')
    expect(mismatches).toEqual([])
  })

  test('math beside raw HTML renders, in a paragraph and in a table cell with a line break; an iframe embeds its page', async ({ page }) => {
    await page.goto(site.web)
    const raw = page.locator('.pm-section[data-section="raw-html"]')
    const paragraph = raw.locator('p', { hasText: 'Energy' })
    await expect(paragraph.locator('b')).toHaveText('is')
    await expect(paragraph.locator('.katex')).toHaveCount(1)
    await expect(paragraph).toContainText('here.')
    const cell = raw.locator('td').nth(1)
    await expect(cell.locator('br')).toHaveCount(1)
    await expect(cell.locator('.katex')).toHaveCount(1)
    await expect(cell).toContainText('第一行')
    await expect(cell).toContainText('也在')
    await expect(raw.locator('td kbd')).toHaveText('Ctrl')

    const figure = page.locator('.pm-section[data-section="embed"] figure')
    await expect(figure.locator('iframe')).toHaveAttribute('src', 'https://example.com/')
    await expect(figure.locator('figcaption')).toHaveText('嵌入的页面')
  })

  test('the origin bar names the version on screen and explains its badge; the output notes say what the run did', async ({ page }) => {
    await page.goto(`${site.web}/?view=present&section=versions&step=0`)
    const present = page.getByRole('region', { name: '放映' })
    const file = present.locator('.pm-code-origin__file')
    await expect(file).toHaveText('merge.py:1-2')
    await expect(file).toHaveAttribute('href', /\/v1\/merge\.py#L1-L2$/)
    await expect(present.locator('.pm-code-origin__variant[data-active]')).toHaveText('v1')
    await page.keyboard.press('ArrowRight')
    await expect(file).toHaveText('merge.py:11-13')
    await expect(file).toHaveAttribute('href', /\/v2\/merge\.py#L11-L13$/)
    await expect(present.locator('.pm-code-origin__variant[data-active]')).toHaveText('v2')

    await page.goto(site.web)
    const pinned = page.locator('.pm-section[data-section="pinned"]')
    await expect(pinned.locator('.pm-code-origin__badge[data-drift="drifted"]')).toHaveAttribute('title', /presmium check/)
    await expect(pinned.locator('.pm-output__note')).toHaveText('超时 · 退出码 1 · 预录输出')
  })

  test('a listing morphs from one version to the next; with reduced motion it is replaced at once', async ({ page }) => {
    await page.goto(`${site.web}/?view=present&section=versions&step=0`)
    const present = page.getByRole('region', { name: '放映' })
    await expect(present.locator('.shiki-magic-move-container')).toBeVisible()
    await page.keyboard.press('ArrowRight')
    await expect(present.locator('.shiki-magic-move-container')).toContainText('new_id')

    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto(`${site.web}/?view=present&section=versions&step=0`)
    await expect(present.locator('.pm-code .shiki')).toContainText('return pair')
    await page.keyboard.press('ArrowRight')
    await expect(present.locator('.pm-code .shiki')).toContainText('new_id')
    await expect(present.locator('.shiki-magic-move-container')).toHaveCount(0)
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0)
  })

  test('in the scrolly layout, a step without narration (the code block\'s own) takes a quarter of a screen', async ({ page }) => {
    await page.goto(`${site.web}/#version-track`)
    const section = page.locator('.pm-section[data-section="version-track"]')
    await expect(section).toHaveClass(/pm-section--scrolly/)
    // Nine versions: narration at the first two steps, the other seven are the block's own.
    expect(site.doc.sections.find(s => s.id === 'version-track')!.steps).toBe(8)
    const narrated = 2
    const bare = 7
    await expect(section.locator('.pm-step')).toHaveCount(narrated + bare)
    await expect(section.locator('.pm-step--bare')).toHaveCount(bare)
    const { height, screen } = await section.evaluate(el => ({ height: el.getBoundingClientRect().height, screen: innerHeight }))
    expect(height).toBeLessThanOrEqual((narrated + bare * 0.25) * screen)
  })
})

test.describe('narration a pass moved into a component (e2e/fixtures/viewer/predict)', () => {
  test.describe.configure({ mode: 'serial', timeout: 120_000 })
  let site: FixtureDeck
  test.beforeAll(async () => {
    test.setTimeout(300_000)
    site = await buildFixture('viewer/predict', { to: 'web' })
  })
  test.afterAll(() => site?.close())

  test('the presenter view lists a reveal\'s narration, which PmPredict holds, among its notes and as the next step\'s', async ({ page }) => {
    const reveal = '每一轮只合并出现最多的那一对'
    await page.goto(`${site.web}?view=presenter&section=merge&step=0`)
    const notes = page.locator('.pm-presenter')
    await expect(notes).toHaveAttribute('data-step', '0')
    await expect(notes.locator('.pm-presenter__note')).toHaveText([/先请大家估计一下/, new RegExp(reveal)])
    await expect(notes.locator('.pm-current')).toContainText('先请大家估计一下')
    await expect(notes.locator('.pm-presenter__next')).toContainText(reveal)
    // On the screen the audience sees, the narration stays off the slide.
    await expect(notes.locator('.pm-presenter__slide')).not.toContainText(reveal)
    await page.keyboard.press('ArrowRight')
    await expect(notes).toHaveAttribute('data-step', '1')
    await expect(notes.locator('.pm-current')).toContainText(reveal)
  })
})

test.describe('steps in the web form (e2e/fixtures/viewer/steps)', () => {
  test.describe.configure({ mode: 'serial', timeout: 120_000 })
  let site: FixtureDeck
  test.beforeAll(async () => {
    test.setTimeout(300_000)
    site = await buildFixture('viewer/steps', { to: 'web' })
  })
  test.afterAll(() => site?.close())

  test('the present view shows a step the same, whether it opens at the step or steps there from step 0 (K-04, F-77)', async ({ page }) => {
    const present = page.getByRole('region', { name: '放映' })
    const { steps } = site.doc.sections.find(s => s.id === 'walk')!
    /** The present view's markup at `step`, once it no longer changes (the highlighter and the component load late). */
    const settledAt = async (step: number) => {
      await expect(present).toHaveAttribute('data-step', String(step))
      await expect(present.locator('.pm-demo-stepper')).toBeAttached()
      if (step === steps) await expect(present.locator('.pm-code[data-lang="python"] .line span').first()).toBeVisible()
      let last = ''
      await expect.poll(async () => {
        const now = await present.innerHTML()
        const same = now === last
        last = now
        return same
      }, { intervals: [300] }).toBe(true)
      return last
    }
    // A step of the stepper, and the last, where the code shows highlighted.
    for (const step of [3, steps]) {
      await page.goto(`${site.web}/?view=present&section=walk&step=${step}`)
      const jumped = await settledAt(step)
      await page.goto(`${site.web}/?view=present&section=walk&step=0`)
      await settledAt(0)
      for (let i = 0; i < step; i++) await page.keyboard.press('ArrowRight')
      expect(await settledAt(step), `step ${step}`).toBe(jumped)
    }
  })
})

test.describe('tags of an agent\'s trace beside inline SVG and MathML (e2e/fixtures/viewer/tags)', () => {
  test.describe.configure({ mode: 'serial', timeout: 120_000 })
  let site: FixtureDeck
  test.beforeAll(async () => {
    test.setTimeout(300_000)
    // The build fails if the slides' unclosed <reminder> reaches Slidev as markup.
    site = await buildFixture('viewer/tags', { to: 'web,slides,notebook' })
  })
  test.afterAll(() => site?.close())

  test('inline SVG and MathML stay elements in narration and in a table cell, and a tag that names no element shows as written, in the three forms', async ({ page }) => {
    const SVG = 'http://www.w3.org/2000/svg'
    await page.goto(site.web)
    const section = page.locator('.pm-section[data-section="trace"]')
    const narration = section.locator('p', { hasText: '完成的回合' })
    for (const where of [narration, section.locator('td', { hasText: '完成' })]) {
      await expect(where.locator('svg.pm-fixture-dot circle')).toHaveCount(1)
      expect(await where.locator('circle').evaluate(el => el.namespaceURI)).toBe(SVG)
    }
    expect(await narration.locator('math mi').evaluate(el => el.namespaceURI)).toBe('http://www.w3.org/1998/Math/MathML')
    await expect(narration).toContainText('写一个 <reminder>；圆点')
    await expect(section.locator('td', { hasText: '保持测试通过' })).toHaveText('<reminder> 保持测试通过')
    await expect(section.locator('reminder')).toHaveCount(0)

    await page.goto(`${site.slides}/${site.slide('trace')}`)
    const slide = page.locator('.slidev-page').filter({ has: page.locator('h1', { hasText: '智能体的轨迹' }) })
    await expect(slide.locator('td', { hasText: '保持测试通过' })).toHaveText('<reminder> 保持测试通过')
    expect(await slide.locator('td svg.pm-fixture-dot circle').evaluate(el => el.namespaceURI)).toBe(SVG)

    const notebook = readFileSync(join(site.dir, 'dist/notebook/lecture.ipynb'), 'utf8')
    expect(notebook).toContain('\\\\<reminder> 保持测试通过')
    expect(notebook).toContain('<circle cx=\\"6\\" cy=\\"6\\" r=\\"5\\" fill=\\"currentColor\\"/></svg>')
    expect(notebook).toContain('<math><mi>n</mi><mo>+</mo><mn>1</mn></math>')
  })
})

test.describe('a deck in English (e2e/fixtures/viewer/en)', () => {
  test.describe.configure({ timeout: 120_000 })
  let site: FixtureDeck
  test.beforeAll(async () => {
    test.setTimeout(300_000)
    site = await buildFixture('viewer/en', { to: 'web' })
  })
  test.afterAll(() => site?.close())

  test('the present view, the presenter window, the stage and the code controls speak English', async ({ page }) => {
    const mismatches = hydrationMismatches(page)
    await page.goto(`${site.web}/?view=present&section=steps`)
    const present = page.getByRole('region', { name: 'Presentation' })
    await expect(present).toHaveAttribute('data-section', 'steps')
    await expect(present.locator('.pm-present__counter')).toHaveText('2 / 3 · step 1 of 2')
    for (const name of ['Previous', 'Next', 'Overview', 'Presenter window', 'Full screen', 'Exit presentation']) {
      await expect(present.getByRole('button', { name, exact: true })).toBeVisible()
    }

    // The stage's black screen; the presenter window's reminder and labels.
    await page.keyboard.press('b')
    await expect(page.locator('.pm-stage-black')).toBeVisible()
    const [presenter] = await Promise.all([page.waitForEvent('popup'), page.keyboard.press('p')])
    const notes = presenter.locator('.pm-presenter')
    await expect(notes.locator('.pm-stage-badge')).toHaveText('Audience view blacked out')
    await expect(notes.locator('.pm-presenter__counter')).toHaveText('Step 1 of 2')
    await expect(notes.locator('.pm-presenter__label')).toHaveText(['Narration', 'Next'])
    await expect(notes.getByRole('button', { name: 'Restart timer' })).toBeVisible()
    await expect(presenter.locator('.pm-presenter-panels summary')).toContainText('Panels')
    await presenter.keyboard.press('b')
    await expect(page.locator('.pm-stage-black')).toHaveCount(0)

    // The code block's controls: no executor in this deck.
    await page.keyboard.press('End')
    await expect(present).toHaveAttribute('data-section', 'code')
    const block = present.locator('.pm-code-block')
    await expect(block.getByRole('button', { name: 'Run', exact: true })).toBeDisabled()
    await expect(block.locator('.pm-code-block__hint')).toHaveText('Execution service unavailable')

    await page.keyboard.press('Escape')
    await expect(page.locator('.pm-section[data-section="steps"] .header-anchor')).toHaveAttribute('aria-label', 'Link to "Steps"')
    expect(mismatches).toEqual([])
  })
})

/**
 * `presmium dev --to web` on a copy of a deck, in a directory of its own inside the demo (so the
 * renderers and plugins resolve). Its "editor" records what it is asked to open.
 */
async function devDeck(files: string[]): Promise<{ deck: string, url: string, stop(): Promise<void> }> {
  const deck = deckDir('dev')
  for (const file of files) cpSync(file, join(deck, file.split('/').at(-1)!), { recursive: true })
  writeFileSync(join(deck, 'editor.sh'), `#!/bin/sh\nprintf '%s\\n' "$@" > '${join(deck, 'opened.txt')}'\n`, { mode: 0o755 })
  let server: DevServer
  try {
    server = await startDev(deck, 'web', { LAUNCH_EDITOR: join(deck, 'editor.sh') })
  } catch (error) {
    rmSync(deck, { recursive: true, force: true })
    throw error
  }
  return {
    deck,
    url: server.url,
    async stop() {
      await server.stop()
      rmSync(deck, { recursive: true, force: true })
    },
  }
}

/** Opens a dev page once its dependencies are optimized (`openDevPage`), when `ready` shows. */
function openDev(page: Page, url: string, ready: string) {
  return openDevPage(page, url, page.locator(ready).first())
}

/** Marks the window, so a reload shows as a missing mark. */
async function mark(page: Page) {
  await page.evaluate(() => {
    (window as { marker?: boolean }).marker = true
  })
}

const marked = (page: Page) => page.evaluate(() => (window as { marker?: boolean }).marker === true)

/** The vertical scroll position once it no longer changes from one check to the next. */
async function restingScroll(page: Page): Promise<number> {
  let last = Number.NaN
  await expect.poll(async () => {
    const y = await page.evaluate(() => window.scrollY)
    const resting = y === last
    last = y
    return resting
  }, { intervals: [100] }).toBe(true)
  return last
}

test.describe('presmium dev', () => {
  test.describe.configure({ mode: 'serial', timeout: 120_000 })
  let dev: Awaited<ReturnType<typeof devDeck>>
  test.beforeAll(async () => {
    test.setTimeout(180_000)
    dev = await devDeck(['lecture.md', 'pages', 'plugin'].map(file => resolve('e2e/fixtures/viewer/dev', file)))
  })
  test.afterAll(() => dev?.stop())
  const edit = (from: string | RegExp, to: string, page = 'web') => {
    const file = join(dev.deck, `pages/${page}.md`)
    writeFileSync(file, readFileSync(file, 'utf8').replace(from, to))
  }

  test('an edited paragraph shows within 300 ms, keeping the view, step and scroll position', async ({ page }) => {
    await openDev(page, `${dev.url}web.html`, '.pm-section[data-section="scrolly"]')
    const scrolly = page.locator('.pm-section[data-section="scrolly"]')
    await expect(scrolly.locator('.pm-block--narration').nth(1)).toContainText('第二步，渲染章节')

    await selectView(page, 'scrolly')
    await scrollToStep(page, 'scrolly', 2)
    await mark(page)
    const before = await restingScroll(page)

    // Milliseconds from saving an edit to the page showing it, observed in the page.
    const timeEdit = async (from: string, to: string) => {
      await page.evaluate((text) => {
        const w = window as { shownAt?: number }
        w.shownAt = undefined
        const observer = new MutationObserver(() => {
          if (!document.querySelector('[data-section="scrolly"]')?.textContent?.includes(text)) return
          w.shownAt = Date.now()
          observer.disconnect()
        })
        observer.observe(document.body, { subtree: true, childList: true, characterData: true })
      }, to)
      const saved = Date.now()
      edit(from, to)
      await expect(scrolly).toContainText(to)
      return await page.evaluate(() => (window as { shownAt?: number }).shownAt!) - saved
    }
    // The fastest of up to three edits, so that a moment of load on the machine does not count.
    const words = ['渲染', '绘制', '排版', '呈现']
    const times: number[] = []
    for (let i = 1; i < words.length && !times.some(t => t < 300); i++) {
      times.push(await timeEdit(`第二步，${words[i - 1]}章节`, `第二步，${words[i]}章节`))
    }
    expect(Math.min(...times), `times: ${times.join(', ')}`).toBeLessThan(300)

    // Same page (no reload), same view, step and scroll position.
    expect(await marked(page)).toBe(true)
    await expect(menu(page)).toHaveValue('scrolly')
    await expect(scrolly).toHaveAttribute('data-step', '2')
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(before)
  })

  test('a page whose request for the current document is answered before two edits, and arrives after them, shows the second edit (F-84)', async ({ page }) => {
    await openDev(page, `${dev.url}web.html`, '.pm-section[data-section="scrolly"]')
    const scrolly = page.locator('.pm-section[data-section="scrolly"]')
    // The dev server answers the page's requests for the current document (when it loads and connects) at
    // once; the answers reach the page only after the two edits came over the WebSocket.
    let release!: () => void
    const held = new Promise<void>((done) => {
      release = done
    })
    let answered = 0
    let delivered = 0
    await page.route(/\/__presmium\/ir(?:\?|$)/, async (route) => {
      const response = await route.fetch()
      answered++
      await held
      await route.fulfill({ response })
      delivered++
    })
    await page.reload()
    await expect(scrolly).toBeVisible()
    await expect.poll(() => answered).toBeGreaterThan(0)
    // Words of this run, so the test can be repeated on the same server (`--repeat-each`).
    const [first, second] = [1, 2].map(n => `第二步，第 ${n} 次改动 ${test.info().repeatEachIndex}-${Date.now()}`)
    edit(/第二步，[^。]*/, first!)
    await expect(scrolly).toContainText(first!)
    edit(first!, second!)
    await expect(scrolly).toContainText(second!)
    release()
    await expect.poll(() => delivered).toBe(answered)
    // The late answers named an older document: the page keeps the latest.
    await page.waitForTimeout(500)
    await expect(scrolly).toContainText(second!)
    await page.unrouteAll({ behavior: 'ignoreErrors' })
  })

  test('a section, or a block with Alt+click, opens its source in the editor', async ({ page }) => {
    await openDev(page, `${dev.url}web.html`, '.pm-section[data-section="scrolly"]')
    const opened = join(dev.deck, 'opened.txt')
    // File and line the editor was given.
    const asked = () => (existsSync(opened) ? readFileSync(opened, 'utf8').split('\n').slice(0, 2) : [])
    const scrolly = page.locator('.pm-section[data-section="scrolly"]')
    const source = readFileSync(join(dev.deck, 'pages/web.md'), 'utf8').split('\n')
    const lineOf = (text: string) => String(source.findIndex(line => line.includes(text)) + 1)

    await scrolly.getByRole('button', { name: '在编辑器中打开源码' }).click()
    await expect.poll(asked).toEqual([join(dev.deck, 'pages/web.md'), lineOf('## 滚动叙事')])
    rmSync(opened)
    await scrolly.locator('.pm-block--narration', { hasText: '第一步，编译源码' }).click({ modifiers: ['Alt'] })
    await expect.poll(asked).toEqual([join(dev.deck, 'pages/web.md'), lineOf('第一步，编译源码')])
  })

  test('a renamed heading and a new section show without a reload; the sidebar follows', async ({ page }) => {
    await openDev(page, `${dev.url}web.html`, '.pm-section[data-section="scrolly"]')
    const scrolly = page.locator('.pm-section[data-section="scrolly"]')
    await selectView(page, 'scrolly')
    await scrollToStep(page, 'scrolly', 2)
    await mark(page)
    const before = await restingScroll(page)

    edit('## 滚动叙事', '## 滚动叙事改名')
    edit(/$/, '\n(added)=\n## 新增章节\n\n保存后新增的章节。\n')
    await expect(scrolly.locator('h2')).toHaveText('滚动叙事改名')
    await expect(page.locator('.pm-section[data-section="added"]')).toContainText('保存后新增的章节')
    const sidebar = page.locator('.VPSidebar')
    await expect(sidebar.getByRole('link', { name: '滚动叙事改名' })).toBeAttached()
    await expect(sidebar.getByRole('link', { name: '新增章节' })).toBeAttached()

    expect(await marked(page)).toBe(true)
    await expect(menu(page)).toHaveValue('scrolly')
    await expect(scrolly).toHaveAttribute('data-step', '2')
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(before)
  })

  test('in the scrolly view, content added above the reading position keeps it in place', async ({ page }) => {
    await openDev(page, `${dev.url}web.html`, '.pm-section[data-section="scrolly"]')
    const scrolly = page.locator('.pm-section[data-section="scrolly"]')
    const marker = scrolly.locator('.pm-step[data-step="2"]')
    await selectView(page, 'scrolly')
    await scrollToStep(page, 'scrolly', 2)
    const top = () => marker.evaluate(el => Math.round(el.getBoundingClientRect().top))
    const before = await top()
    await mark(page)

    // Paragraphs added to the section above push the reading position down the page.
    const added = Array.from({ length: 4 }, (_, i) => `上方新增的第 ${i + 1} 段讲解，让前一节变长。`).join('\n\n')
    edit('搜索框支持中文分词', `${added}\n\n搜索框支持中文分词`)
    await expect(page.locator('.pm-section[data-section="web"]')).toContainText('上方新增的第 4 段讲解')
    await expect.poll(top).toBe(before)
    await expect(scrolly).toHaveAttribute('data-step', '2')
    expect(await marked(page)).toBe(true)
  })

  test('a keyword written while the server runs can be searched, with the search box closed or open', async ({ page }) => {
    await openDev(page, `${dev.url}web.html`, '.pm-section[data-section="scrolly"]')
    const scrolly = page.locator('.pm-section[data-section="scrolly"]')
    const input = page.getByRole('searchbox')
    const result = page.getByRole('listbox').getByRole('option').first()
    // The search index is updated in the page too: typing again finds the new keyword.
    const find = (word: string) => expect(async () => {
      await input.fill('')
      await input.fill(word)
      await expect(result).toBeVisible({ timeout: 1000 })
    }).toPass({ timeout: 15_000 })
    // The author has searched before editing.
    await page.keyboard.press('Control+k')
    await find('编译源码')
    await page.keyboard.press('Escape')
    await mark(page)

    edit('第一步，编译源码。', '第一步，编译源码，也就是 Quokka 步骤。')
    await expect(scrolly).toContainText('Quokka')
    await page.keyboard.press('Control+k')
    await find('quokka')
    // An edit while the search box is open.
    edit('第三步，发布站点。', '第三步，发布站点，也就是 Numbat 步骤。')
    await expect(scrolly).toContainText('Numbat')
    await find('numbat')

    expect(await marked(page)).toBe(true)
    await result.click()
    await expect(page).toHaveURL(/\/web\.html#scrolly$/)
  })

  test('a component that failed shows its content once the author fixes it, without a reload; the presenter\'s error count goes back to none', async ({ context }) => {
    const page = await context.newPage()
    await openDev(page, `${dev.url}live.html`, '.pm-section[data-section="components"]')
    const section = page.locator('.pm-section[data-section="components"]')
    await expect(section.locator('[data-pm-error="FixtureBoom"]')).toContainText('boom')
    const presenter = await context.newPage()
    await presenter.goto(`${dev.url}live.html?view=presenter&section=components`)
    const badge = presenter.locator('.pm-presenter-panels__badge')
    await expect(badge).toHaveText('1')
    await mark(page)

    edit('fail: true', 'fail: false', 'live')
    await expect(section.locator('.fx-boom')).toHaveText('all good')
    await expect(section.locator('[data-pm-error]')).toHaveCount(0)
    await expect(badge).toHaveCount(0)
    expect(await marked(page)).toBe(true)
  })

  test('a live update that removes a click target leaves the relative clicks after it at their steps', async ({ page }) => {
    await openDev(page, `${dev.url}live.html?view=present&section=components&step=4`, '.pm-present .fx-clicks')
    const last = page.locator('.pm-present .fx-clicks__last')
    await expect(last).toHaveAttribute('data-pm-click', 'shown')
    await page.keyboard.press('ArrowLeft')
    await expect(last).toHaveAttribute('data-pm-click', 'hidden')

    // One word less: the last mark comes one step earlier.
    edit(':span: 4\nitems: [甲, 乙, 丙]', ':span: 3\nitems: [甲, 乙]', 'live')
    await expect(page.locator('.pm-present .fx-clicks__item')).toHaveCount(2)
    await expect(page.locator('.pm-present')).toHaveAttribute('data-step', '3')
    await expect(last).toHaveAttribute('data-pm-click', 'shown')
    await page.keyboard.press('ArrowLeft')
    await expect(last).toHaveAttribute('data-pm-click', 'hidden')
    await expect(page.locator('.pm-present .fx-clicks__item').nth(1)).toHaveAttribute('data-pm-click', 'shown')
  })

  test('renaming the title of the section on screen keeps the present view at its place', async ({ page }) => {
    const id = (await (await page.request.get(`${dev.url}__presmium/ir`)).json() as { doc: { sections: { id: string, title: string }[] } })
      .doc.sections.find(s => s.title === '会改名的一节')!.id
    await openDev(page, `${dev.url}live.html?view=present&section=${encodeURIComponent(id)}&step=1`, '.pm-present')
    const present = page.locator('.pm-present')
    await expect(present).toHaveAttribute('data-step', '1')
    edit('## 会改名的一节', '## 改过名的一节', 'live')
    await expect(present.locator('.pm-present__title')).toHaveText('改过名的一节')
    await expect(present).toHaveAttribute('data-step', '1')
    await expect(present.locator('li').nth(1)).toBeVisible()
  })

  test('a page opened right after a save shows the saved text', async ({ page }) => {
    await openDev(page, `${dev.url}live.html`, '.pm-section[data-section="slow"]')
    edit('这段代码运行四秒。', '这段代码运行四秒，保存后立即打开。', 'live')
    await page.goto(`${dev.url}live.html`)
    await expect(page.locator('.pm-section[data-section="slow"]')).toContainText('保存后立即打开', { timeout: 15_000 })
  })

  test('the output of a run of code that changed while it ran is not shown', async ({ page }) => {
    await openDev(page, `${dev.url}live.html`, '.pm-section[data-section="slow"]')
    const block = page.locator('.pm-section[data-section="slow"] .pm-code-block')
    await expect(block.getByRole('button', { name: '运行' })).toBeEnabled({ timeout: 30_000 })
    await block.getByRole('button', { name: '运行' }).click()
    await expect(block.getByRole('button', { name: '运行中…' })).toBeVisible()
    edit('旧代码的输出', '新代码的输出', 'live')
    await expect(block).toContainText('新代码的输出')
    await expect(block.getByRole('button', { name: '运行' })).toBeEnabled()
    // Longer than the run would have taken.
    await page.waitForTimeout(5000)
    await expect(block.locator('.pm-outputs')).toHaveCount(0)
  })

  test('a component the author adds to the deck while the server runs is registered at the next save', async ({ page }) => {
    await openDev(page, `${dev.url}live.html`, '.pm-section[data-section="components"]')
    mkdirSync(join(dev.deck, 'components'), { recursive: true })
    writeFileSync(join(dev.deck, 'components/FixtureAdded.vue'), '<template><p class="fx-added">新加的组件</p></template>\n')
    edit(/$/, '\n(added-component)=\n## 新加的组件\n\n:::{component} FixtureAdded\n:::\n\n服务运行时加入的组件。\n', 'live')
    // The theme's list of components changes too: the page may reload.
    await expect(page.locator('.pm-section[data-section="added-component"] .fx-added')).toHaveText('新加的组件', { timeout: 30_000 })
  })
})

test.describe('a plugin that extends the IR runtime', () => {
  test.describe.configure({ mode: 'serial', timeout: 120_000 })
  let dev: Awaited<ReturnType<typeof devDeck>>
  test.beforeAll(async () => {
    test.setTimeout(180_000)
    const fixture = resolve('packages/viewer/test/fixtures/plugin-deck')
    dev = await devDeck(['lecture.md', 'notes.md', 'plugin', 'broken'].map(file => join(fixture, file)))
  })
  test.afterAll(() => dev?.stop())

  test('its view appears in the view menu and keeps the position; its renderers draw their nodes', async ({ page }) => {
    await openDev(page, `${dev.url}?section=probe`, '.pm-section[data-section="probe"]')
    await expect(page.locator('h2#probe')).toBeInViewport()
    await expect(menu(page).locator('option', { hasText: '卡片' })).toBeAttached()

    await selectView(page, 'cards')
    const cards = page.locator('.pm-card')
    await expect(cards).toHaveCount(3)
    await expect(page.locator('.pm-card[aria-current="true"]')).toHaveAttribute('data-section', 'probe')
    await selectView(page, 'document')
    await expect(page.locator('h2#probe')).toBeInViewport()

    // A renderer for a node kind (csv code) and one for a component.
    const table = page.locator('.pm-section[data-section="table"]')
    await expect(table.locator('table.pm-csv td', { hasText: '苹果' })).toBeVisible()
    await expect(table.locator('.pm-swapped')).toHaveText('插件的渲染器')
    await expect(table.locator('.pm-swap')).toHaveCount(0)
    // The deck has no slides form, so no section links to one.
    await expect(page.getByRole('link', { name: '在幻灯片中打开' })).toHaveCount(0)
  })

  test('a viewer plugin that throws is left out: the others install, and the start report says it failed', async ({ page }) => {
    await openDev(page, `${dev.url}?view=presenter&section=probe`, '.pm-presenter')
    await expect(menu(page).locator('option', { hasText: '卡片' })).toBeAttached()
    await page.locator('.pm-presenter-panels summary').click()
    const broken = page.locator('.pm-start-report [data-plugin="presmium-example-broken-viewer (viewer)"]')
    await expect(broken).toHaveAttribute('data-status', 'failed')
    await expect(broken).toContainText('the fixture viewer plugin failed on purpose')
  })

  test('a component written for Slidev sees its section\'s $frontmatter, $page and $clicks, and v-click rules', async ({ page }) => {
    await openDev(page, `${dev.url}?view=present&section=probe`, '.pm-present .pm-probe')
    const probe = page.locator('.pm-present .pm-probe')
    // $frontmatter is the section's (title and web hints), not the VitePress page's.
    await expect(probe).toHaveAttribute('data-title', '探针')
    await expect(probe).toHaveAttribute('data-accent', 'teal')
    await expect(probe).toHaveAttribute('data-page', '3')
    const shown = (part: string) => probe.locator(`.pm-probe__${part}`)
    const states = async () => Promise.all(['click', 'after', 'hide'].map(part => shown(part).getAttribute('data-pm-click')))

    await expect(probe).toHaveAttribute('data-clicks', '0')
    await expect.poll(states).toEqual(['hidden', 'hidden', 'shown'])
    await page.keyboard.press('ArrowRight')
    await expect(probe).toHaveAttribute('data-clicks', '1')
    await expect.poll(states).toEqual(['shown', 'shown', 'shown'])
    await page.keyboard.press('ArrowRight')
    await expect(probe).toHaveAttribute('data-clicks', '2')
    await expect.poll(states).toEqual(['shown', 'shown', 'hidden'])
    // Stepping back is the reverse.
    await page.keyboard.press('ArrowLeft')
    await expect.poll(states).toEqual(['shown', 'shown', 'shown'])

    // The document view shows the final state.
    await page.keyboard.press('Escape')
    const inPage = page.locator('.pm-section[data-section="probe"] .pm-probe')
    await expect.poll(() => Promise.all(['click', 'after', 'hide'].map(part => inPage.locator(`.pm-probe__${part}`).getAttribute('data-pm-click')))).toEqual(['shown', 'shown', 'hidden'])
  })

  test('a footnote reference opens its definition, which the compiler keeps in the same section, by its number', async ({ page }) => {
    await openDev(page, dev.url, '.pm-section[data-section="table"]')
    const reference = page.locator('.pm-section[data-section="table"] .pm-footnote-ref a')
    // The deck's first footnote, numbered by the compiler.
    await expect(reference).toHaveAttribute('data-label', '1')
    await reference.click()
    await expect(page).toHaveURL(/#fn-csv$/)
    const definition = page.locator('.pm-section[data-section="table"] #fn-csv')
    await expect(definition).toContainText('CSV 是逗号分隔的值')
    await expect(definition.locator('sup')).toHaveAttribute('data-label', '1')
    await expect(definition).toBeInViewport()
  })
})
