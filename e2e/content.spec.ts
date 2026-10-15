import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { SLIDES } from './urls.ts'

// The slides of examples/demo/pages/content.md are addressed by their routeAlias,
// so the spec does not depend on how many slides come before them.
async function open(page: Page, alias: string) {
  await page.goto(`${SLIDES}/${alias}`)
  const slide = page.locator(`.slidev-layout.pm-${alias}`)
  await expect(slide).toBeVisible()
  return slide
}

const media = (element: Locator) => element.evaluate((el: HTMLMediaElement) => el.duration)

test('formulas, Mermaid and PlantUML render as math, an svg diagram and a diagram image', async ({ page }) => {
  const slide = await open(page, 'content-diagrams')
  await expect(slide.locator('.katex annotation').first()).toHaveText('e^{i\\pi} + 1 = 0')
  await expect(slide.locator('.katex-display annotation')).toContainText('\\frac{n(n+1)}{2}')
  await expect(slide.locator('svg[aria-roledescription="flowchart-v2"]')).toContainText('VitePress')
  await expect(slide.locator('img[src*="plantuml"]')).toHaveAttribute('src', /^https:\/\/www\.plantuml\.com\/plantuml\/svg\/\w+/)
})

test('a markmap code block becomes a mindmap that fits its slide', async ({ page }) => {
  // Entering from the previous slide also covers a map mounted while its slide was hidden.
  await open(page, 'content-diagrams')
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

test('video, audio and an animated image load from the build with controls and sizes', async ({ page }) => {
  const slide = await open(page, 'content-media')
  const video = slide.locator('video')
  await expect(video).toHaveAttribute('controls', '')
  await expect(video).toHaveAttribute('width', '280')
  await expect.poll(() => media(video)).toBeCloseTo(3, 0)
  await video.evaluate((el: HTMLVideoElement) => el.play())
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime)).toBeGreaterThan(0)

  const audio = slide.locator('audio')
  await expect(audio).toHaveAttribute('controls', '')
  await expect.poll(() => media(audio)).toBeCloseTo(2, 0)

  const image = slide.locator('picture img')
  await expect(image).toHaveAttribute('width', '96')
  await expect.poll(() => image.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth)).toBe(96)
  expect(await image.evaluate((el: HTMLImageElement) => el.currentSrc)).toMatch(/\.gif$/)

  // With reduced motion the animated image gives way to a still one.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const still = (await open(page, 'content-media')).locator('picture img')
  await expect.poll(() => still.evaluate((el: HTMLImageElement) => el.currentSrc)).toMatch(/png/)
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
