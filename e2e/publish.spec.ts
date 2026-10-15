import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { SLIDES } from './urls.ts'

// examples/demo/pages/publish.md declares `routeAlias: publish`.
const PUBLISH = `${SLIDES}/publish`

async function openPublish(page: Page): Promise<Locator> {
  await page.goto(PUBLISH)
  const slide = page.locator('.slidev-layout.pm-publish').first()
  await expect(slide.locator('h1')).toHaveText('发布')
  return slide
}

test('once loaded, the built deck reloads and plays offline', async ({ page, context }) => {
  await openPublish(page)
  // The service worker activates once it has precached the deck.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })

  // Without network and without the browser's HTTP cache, only the service worker can serve the deck.
  await context.setOffline(true)
  await (await context.newCDPSession(page)).send('Network.clearBrowserCache')
  const slide = await openPublish(page)
  await expect(slide.locator('pre.shiki')).toContainText('def add(a, b):')
  // Other slides load from the cache too.
  await page.keyboard.press('ArrowLeft')
  await expect(page).toHaveURL(/\/\d+$/)
  await expect(page.locator(`.slidev-page-${new URL(page.url()).pathname.slice(1)}`)).toBeVisible()
})

/**
 * Text color, faded by the opacity of its element and ancestors, and the
 * effective background (alpha composited) of every visible text in `root`, as sRGB.
 */
function textColors(root: Locator) {
  return root.evaluate((el) => {
    const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!
    const rgba = (css: string) => {
      ctx.clearRect(0, 0, 1, 1)
      ctx.fillStyle = css
      ctx.fillRect(0, 0, 1, 1)
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
      return [r!, g!, b!, a! / 255]
    }
    const over = (top: number[], bottom: number[]) => [0, 1, 2].map(i => top[i]! * top[3]! + bottom[i]! * (1 - top[3]!)).concat(1)
    const texts: { text: string, fg: number[], bg: number[] }[] = []
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement
      if (!parent || !node.textContent?.trim() || !parent.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue
      const layers: number[][] = []
      let opacity = 1
      for (let e: Element | null = parent; e; e = e.parentElement) {
        opacity *= Number(getComputedStyle(e).opacity)
        const layer = rgba(getComputedStyle(e).backgroundColor)
        if (layer[3]! > 0 && layers.at(-1)?.[3] !== 1) layers.push(layer)
      }
      const bg = layers.reverse().reduce((under, layer) => over(layer, under), [255, 255, 255, 1])
      const fg = rgba(getComputedStyle(parent).color)
      texts.push({ text: node.textContent.trim(), fg: over([fg[0]!, fg[1]!, fg[2]!, fg[3]! * opacity], bg), bg })
    }
    return texts
  })
}

/** WCAG 2 contrast ratio of two opaque sRGB colors. */
function contrast(a: number[], b: number[]): number {
  const luminance = (rgb: number[]) => {
    const [r, g, bl] = rgb.slice(0, 3).map(v => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4))
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!
  }
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi! + 0.05) / (lo! + 0.05)
}

/** Texts below the WCAG AA ratio for normal text (4.5:1). */
async function lowContrastTexts(slide: Locator): Promise<string[]> {
  const texts = await textColors(slide)
  expect(texts.length).toBeGreaterThan(0)
  return texts.filter(t => contrast(t.fg, t.bg) < 4.5).map(t => `${t.text} (${contrast(t.fg, t.bg).toFixed(2)})`)
}

test('the high-contrast switch brings every text to WCAG AA', async ({ page }) => {
  const slide = await openPublish(page)
  // Default theme colors, e.g. code comments, fall below AA.
  expect(await lowContrastTexts(slide)).not.toEqual([])

  const toggle = slide.getByRole('switch', { name: '高对比度' })
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-checked', 'true')
  await expect(page.locator('html')).toHaveAttribute('data-pm-contrast', 'high')
  expect(await lowContrastTexts(slide)).toEqual([])

  // The choice is remembered across pages; text the theme fades, like the cover subtitle, passes too.
  await page.goto(`${SLIDES}/1`)
  const cover = page.locator('.slidev-page-1 .slidev-layout')
  await expect(cover.locator('h1')).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-pm-contrast', 'high')
  expect(await lowContrastTexts(cover)).toEqual([])

  // The dark color scheme has its own palette, which passes as well.
  await page.emulateMedia({ colorScheme: 'dark' })
  expect(await lowContrastTexts(await openPublish(page))).toEqual([])
})
