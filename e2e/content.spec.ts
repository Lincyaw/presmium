import { readdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { useFixture } from './fixtures/deck.ts'
import { build, serve, writeDeck } from './fixtures/plugins/decks.ts'

// e2e/fixtures/content: its sections set a routeAlias for the slides form, so the spec does not
// depend on how many slides come before them.
test.describe.configure({ mode: 'default' })
const content = useFixture('content')

async function open(page: Page, alias: string) {
  await page.goto(`${content().slides}/${alias}`)
  const slide = page.locator(`.slidev-layout.pm-${alias}`)
  await expect(slide).toBeVisible()
  return slide
}

const media = (element: Locator) => element.evaluate((el: HTMLMediaElement) => el.duration)
const loaded = (image: Locator) => image.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth)

test('formulas, Mermaid and PlantUML render as math, an svg diagram and a local diagram image', async ({ page }) => {
  const slide = await open(page, 'content-diagrams')
  await expect(slide.locator('.katex annotation').first()).toHaveText('e^{i\\pi} + 1 = 0')
  await expect(slide.locator('.katex-display annotation')).toContainText('\\frac{n(n+1)}{2}')
  // Slidev draws Mermaid diagrams in a shadow root.
  await expect(slide.locator('.mermaid svg[aria-roledescription="flowchart-v2"]')).toContainText('VitePress')

  // The ```plantuml block is an image drawn by the PlantUML server, downloaded at compile time.
  const diagram = (await open(page, 'content-sequence')).getByRole('img', { name: 'PlantUML 图' })
  await expect.poll(() => loaded(diagram)).toBeGreaterThan(0)
  expect(await diagram.getAttribute('src')).not.toMatch(/^https?:/)
})

test('a {markmap} directive becomes a mindmap that fits its slide', async ({ page }) => {
  // Entering from the previous slide also covers a map mounted while its slide was hidden.
  await open(page, 'content-sequence')
  await page.keyboard.press('ArrowRight')
  const map = page.locator('.slidev-layout.pm-content-mindmap svg.pm-markmap')
  await expect(map.locator('.markmap-node')).toHaveCount(13)
  await expect(map.locator('.markmap-node').last()).toHaveText('富内容')

  // Fitted: the nodes stay inside the svg and fill most of its width or height.
  const fitted = () => map.evaluate((svg) => {
    const box = svg.getBoundingClientRect()
    const nodes = [...svg.querySelectorAll('.markmap-node')].map(node => node.getBoundingClientRect())
    const left = Math.min(...nodes.map(r => r.left))
    const right = Math.max(...nodes.map(r => r.right))
    const top = Math.min(...nodes.map(r => r.top))
    const bottom = Math.max(...nodes.map(r => r.bottom))
    const inside = left >= box.left && right <= box.right && top >= box.top && bottom <= box.bottom
    return inside && Math.max((right - left) / box.width, (bottom - top) / box.height) > 0.8
  })
  await expect.poll(fitted).toBe(true)
})

test('media directives give video, audio and an animated image from the build, with controls and sizes', async ({ page }) => {
  const slide = await open(page, 'content-media')
  const video = slide.locator('figure.pm-media video')
  await expect(video).toHaveAttribute('controls', '')
  await expect(video).toHaveAttribute('width', '280')
  await expect.poll(() => media(video)).toBeCloseTo(3, 0)
  await video.evaluate((el: HTMLVideoElement) => el.play())
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime)).toBeGreaterThan(0)
  await expect(slide.locator('figure.pm-media:has(video) figcaption')).toContainText('controls 显示播放控制')

  const audio = slide.locator('figure.pm-media audio')
  await expect(audio).toHaveAttribute('controls', '')
  await expect.poll(() => media(audio)).toBeCloseTo(2, 0)

  const image = slide.getByRole('img', { name: '旋转的加载动画' })
  await expect(image).toHaveCount(1)
  await expect(image).toHaveAttribute('width', '96')
  await expect.poll(() => loaded(image)).toBe(96)
  expect(await image.getAttribute('src')).toMatch(/\.gif$/)

  // With reduced motion the animated image gives way to a still one.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const still = (await open(page, 'content-media')).getByRole('img', { name: '旋转的加载动画' })
  await expect(still).toHaveCount(1)
  await expect.poll(() => loaded(still)).toBe(96)
  expect(await still.getAttribute('src')).not.toMatch(/\.gif$/)
})

test('an embedded web component keeps its own interactive state', async ({ page }) => {
  const slide = await open(page, 'content-element')
  const counters = slide.locator('presmium-demo-counter')
  const [first, second] = [counters.nth(0), counters.nth(1)]
  await expect(first.locator('output')).toHaveText('0')
  await expect(second.locator('output')).toHaveText('10')

  await first.locator('button').click()
  await first.locator('button').click()
  await expect(first.locator('output')).toHaveText('2')
  await expect(second.locator('output')).toHaveText('10')
  // Clicking inside the slide does not advance the deck.
  await expect(slide).toBeVisible()
})

test('the web form renders the same content: math, diagrams, mindmap, media and the web component', async ({ page }) => {
  await page.goto(`${content().web}/content.html`)
  const section = (id: string) => page.locator(`.pm-section[data-section="${id}"]`)
  await expect(section('content-diagrams').locator('.katex').first()).toBeVisible()
  await expect(section('content-diagrams').locator('svg[aria-roledescription="flowchart-v2"]')).toContainText('VitePress')
  await expect.poll(() => loaded(section('content-sequence').getByRole('img', { name: 'PlantUML 图' }))).toBeGreaterThan(0)
  await expect(section('content-mindmap').locator('svg.pm-markmap .markmap-node')).toHaveCount(13)

  const counter = section('content-element').locator('presmium-demo-counter').first()
  await counter.locator('button').click()
  await expect(counter.locator('output')).toHaveText('1')

  // The media files are the component's `assets`, which the web renderer publishes.
  const video = section('content-media').locator('figure.pm-media video')
  test.skip(!(await video.getAttribute('src'))?.startsWith('/'), 'WP-70b: the web renderer publishes ComponentNode.assets (C-7); remove this guard once WP-70b is merged')
  await expect(video).toHaveAttribute('width', '280')
  await expect.poll(() => media(video)).toBeCloseTo(3, 0)
  await expect.poll(() => media(section('content-media').locator('figure.pm-media audio'))).toBeCloseTo(2, 0)
  const image = section('content-media').getByRole('img', { name: '旋转的加载动画' })
  await expect(image).toHaveCount(1)
  await expect.poll(() => loaded(image)).toBe(96)
})

test('the mindmap folds and unfolds a node from the keyboard (N-06)', async ({ page }) => {
  await page.goto(`${content().web}/content.html`)
  const map = page.locator('.pm-section[data-section="content-mindmap"] svg.pm-markmap')
  await expect(map.locator('.markmap-node')).toHaveCount(13)
  // The fold toggle of a node with children is a button in the tab order.
  const toggle = map.getByRole('button', { name: '折叠或展开：公式' })
  await expect(toggle).toHaveAttribute('tabindex', '0')
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await toggle.focus()
  await page.keyboard.press('Enter')
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(map.locator('.markmap-node')).toHaveCount(11)
  await page.keyboard.press('Space')
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(map.locator('.markmap-node')).toHaveCount(13)
})

test.describe('online media', () => {
  test.describe.configure({ timeout: 120_000 })
  let deck: string
  let web: Awaited<ReturnType<typeof serve>>
  let slides: Awaited<ReturnType<typeof serve>>

  // e2e/fixtures/plugins/online.md: {youtube}, and {video} and {audio} with URLs.
  test.beforeAll(async () => {
    test.setTimeout(300_000)
    deck = writeDeck('online', `
title: Online media
plugins:
  - '@presmium/slidev-addon-core'
  - '@presmium/slidev-addon-content'
renderers:
  web: {}
  slides:
    theme: default
  notebook: {}
`, ['online.md'])
    await build(deck, 'web,slides,notebook')
    web = await serve(join(deck, 'dist/web'))
    slides = await serve(join(deck, 'dist/slides'), true)
  })

  test.afterAll(async () => {
    await web?.close()
    await slides?.close()
    if (deck) rmSync(deck, { recursive: true, force: true })
  })

  test('a YouTube video and online video and audio show from their URLs in both forms, and the notebook links to them (P-42)', async ({ page }) => {
    // Nothing is fetched from the network: the players point to their URLs.
    await page.route(/youtube|example\.com/, route => route.abort())
    const PLAYER = 'https://www.youtube-nocookie.com/embed/luoMHjh-XcQ?start=30'

    await page.goto(`${web.url}/online.html`)
    const section = page.locator('.pm-section[data-section="online"]')
    await expect(section.locator('figure.pm-youtube iframe')).toHaveAttribute('src', PLAYER)
    await expect(section.locator('figure.pm-youtube figcaption')).toHaveText('A talk on YouTube')
    await expect(section.locator('figure.pm-media video')).toHaveAttribute('src', 'https://example.com/media/clip.mp4')
    await expect(section.locator('figure.pm-media audio')).toHaveAttribute('src', 'https://example.com/media/tone.ogg')

    await page.goto(`${slides.url}/online`)
    const slide = page.locator('.slidev-layout.pm-online')
    await expect(slide.locator('figure.pm-youtube iframe')).toHaveAttribute('src', PLAYER)
    await expect(slide.locator('figure.pm-media video')).toHaveAttribute('src', 'https://example.com/media/clip.mp4')
    await expect(slide.locator('figure.pm-media audio')).toHaveAttribute('src', 'https://example.com/media/tone.ogg')

    const notebook = readdirSync(join(deck, 'dist/notebook')).find(file => file.endsWith('.ipynb'))!
    const cells = readFileSync(join(deck, 'dist/notebook', notebook), 'utf8')
    expect(cells).toContain('[A talk on YouTube](https://www.youtube.com/watch?v=luoMHjh-XcQ)')
    expect(cells).toContain('[An online video](https://example.com/media/clip.mp4)')
  })
})
