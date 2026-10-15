import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { SLIDES, WEB } from './urls.ts'

// The sections of examples/demo/pages/content.md set a routeAlias for the slides form,
// so the spec does not depend on how many slides come before them.
const WEB_BUILT = existsSync(fileURLToPath(new URL('../examples/demo/dist/web/index.html', import.meta.url)))

async function open(page: Page, alias: string) {
  await page.goto(`${SLIDES}/${alias}`)
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
  test.skip(!WEB_BUILT, 'the web form is not built')
  await page.goto(`${WEB}/content.html`)
  const section = (id: string) => page.locator(`.pm-section[data-section="${id}"]`)
  await expect(section('content-diagrams').locator('.katex').first()).toBeVisible()
  await expect(section('content-diagrams').locator('svg[aria-roledescription="flowchart-v2"]')).toContainText('VitePress')
  await expect.poll(() => loaded(section('content-sequence').getByRole('img', { name: 'PlantUML 图' }))).toBeGreaterThan(0)
  await expect(section('content-mindmap').locator('svg.pm-markmap .markmap-node')).toHaveCount(13)

  const video = section('content-media').locator('figure.pm-media video')
  await expect(video).toHaveAttribute('width', '280')
  await expect.poll(() => media(video)).toBeCloseTo(3, 0)
  await expect.poll(() => media(section('content-media').locator('figure.pm-media audio'))).toBeCloseTo(2, 0)
  const image = section('content-media').getByRole('img', { name: '旋转的加载动画' })
  await expect(image).toHaveCount(1)
  await expect.poll(() => loaded(image)).toBe(96)

  const counter = section('content-element').locator('presmium-demo-counter').first()
  await counter.locator('button').click()
  await expect(counter.locator('output')).toHaveText('1')
})
