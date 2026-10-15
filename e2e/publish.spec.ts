import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import type { BrowserContext, Locator, Page } from '@playwright/test'
import { SLIDES, WEB } from './urls.ts'

// examples/demo/pages/publish.md sets `routeAlias: publish` for the slides form;
// pages/content.md has a Mermaid flowchart (content-diagrams) and a PlantUML diagram (content-sequence).
const PUBLISH = `${SLIDES}/publish`
const WEB_BUILT = existsSync(fileURLToPath(new URL('../examples/demo/dist/web/index.html', import.meta.url)))

async function openPublish(page: Page): Promise<Locator> {
  await page.goto(PUBLISH)
  const slide = page.locator('.slidev-layout.pm-publish').first()
  await expect(slide.locator('h1')).toHaveText('发布')
  return slide
}

/**
 * Takes the browser offline once the page's service worker has precached the build. In Chromium
 * the HTTP cache is cleared too; other engines have no such protocol and keep it (docs/browsers.md).
 */
async function goOffline(page: Page, context: BrowserContext) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  await context.setOffline(true)
  if (context.browser()?.browserType().name() === 'chromium') await (await context.newCDPSession(page)).send('Network.clearBrowserCache')
}

const loaded = (image: Locator) => image.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth)

test('once loaded, the built deck reloads and plays offline, remote diagrams included', async ({ page, context }) => {
  await openPublish(page)
  await goOffline(page, context)
  // Without network and without the browser's HTTP cache, only the service worker can serve the deck.
  const slide = await openPublish(page)
  await expect(slide.locator('pre.shiki')).toContainText('def add(a, b):')
  // Other slides load from the cache too: the one before it, and the cover after another reload.
  await page.keyboard.press('ArrowLeft')
  await expect(page).not.toHaveURL(PUBLISH)
  await expect(slide).toBeHidden()
  await expect(page.locator('.slidev-layout:visible h1')).toBeVisible()
  await page.goto(`${SLIDES}/1`)
  await expect(page.locator('.slidev-page-1 .slidev-layout h1')).toHaveText('Presmium Demo')
  // The PlantUML diagram, an image of a URL without extension, was downloaded into the deck.
  await page.goto(`${SLIDES}/content-sequence`)
  await expect.poll(() => loaded(page.locator('.slidev-layout.pm-content-sequence').getByRole('img', { name: 'PlantUML 图' }))).toBeGreaterThan(0)
})

/**
 * Text color, faded by the opacity of its element and ancestors, and the
 * effective background (alpha composited) of every visible text in `root`,
 * open shadow roots included (Slidev draws Mermaid diagrams in one), as sRGB.
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
    const up = (e: Element) => e.parentElement ?? ((e.parentNode as ShadowRoot | null)?.host ?? null)
    const textNodes = (node: Node): Text[] => {
      const found: Text[] = []
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT)
      for (let n: Node | null = walker.currentNode; n; n = walker.nextNode()) {
        if (n instanceof Text) found.push(n)
        else if (n instanceof Element && n.shadowRoot) found.push(...textNodes(n.shadowRoot))
      }
      return found
    }
    const texts: { text: string, fg: number[], bg: number[] }[] = []
    for (const node of textNodes(el)) {
      const parent = node.parentElement
      if (!parent || !node.textContent?.trim() || !parent.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue
      const layers: number[][] = []
      let opacity = 1
      for (let e: Element | null = parent; e; e = up(e)) {
        opacity *= Number(getComputedStyle(e).opacity)
        const layer = rgba(getComputedStyle(e).backgroundColor)
        if (layer[3]! > 0 && layers.at(-1)?.[3] !== 1) layers.push(layer)
      }
      const bg = layers.reverse().reduce((under, layer) => over(layer, under), [255, 255, 255, 1])
      // SVG text draws with its fill.
      const style = getComputedStyle(parent)
      const fg = rgba(parent instanceof SVGElement ? style.fill : style.color)
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

test('the high-contrast switch brings the text of the slide to WCAG AA and is remembered', async ({ page }) => {
  const slide = await openPublish(page)
  // Default theme colors, e.g. code comments, fall below AA.
  expect(await lowContrastTexts(slide)).not.toEqual([])

  const toggle = slide.getByRole('switch', { name: '高对比度' })
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-checked', 'true')
  await expect(page.locator('html')).toHaveAttribute('data-pm-contrast', 'high')
  expect(await lowContrastTexts(slide)).toEqual([])

  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-pm-contrast', 'high')
  await expect(slide.getByRole('switch', { name: '高对比度' })).toHaveAttribute('aria-checked', 'true')
})

test('switched on in dark mode, high contrast brings the labels of a Mermaid diagram to AA', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto(`${SLIDES}/content-diagrams`)
  const slide = page.locator('.slidev-layout.pm-content-diagrams')
  const label = slide.locator('.mermaid .edgeLabel p').first()
  await expect(label).toHaveText('幻灯片')
  // Mermaid's dark theme draws its edge labels below AA (4.43:1).
  expect((await lowContrastTexts(slide)).some(text => text.startsWith('幻灯片'))).toBe(true)

  // The switch in the navigation bar.
  await page.getByRole('switch', { name: '高对比度' }).filter({ visible: true }).first().click()
  await expect(page.locator('html')).toHaveAttribute('data-pm-contrast', 'high')
  await expect.poll(() => lowContrastTexts(slide)).toEqual([])
})

test('high contrast keeps the opacity that other plugins give their step states', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('presmium.publish.contrast', 'high'))
  // The cursor of the guide is not on screen before its first step.
  await page.goto(`${SLIDES}/1`)
  const guide = page.locator('.slidev-layout.pm-guide')
  await guide.waitFor({ state: 'attached', timeout: 15_000 })
  const no = await guide.evaluate(el => Number(/slidev-page-(\d+)/.exec(el.closest('.slidev-page')?.className ?? '')?.[1]))
  await page.goto(`${SLIDES}/${no}?clicks=0`)
  await expect(page.locator('html')).toHaveAttribute('data-pm-contrast', 'high')
  await expect(page.locator('.slidev-layout.pm-guide .pm-cursor')).toHaveCSS('opacity', '0')
  // The steps the stepper of the core page has done stay dimmed.
  await page.goto(`${SLIDES}/2?clicks=3`)
  await expect(page.locator('.pm-demo-stepper li[data-status="done"]').first()).toHaveCSS('opacity', '0.6')
})

// Every slide of the demo deck, with all its click steps shown, whatever plugin draws it.
test.describe('every slide', () => {
  test.use({ serviceWorkers: 'block' })

  for (const colorScheme of ['light', 'dark'] as const) {
    test(`in high contrast, every slide reaches WCAG AA (${colorScheme})`, async ({ page }) => {
      test.setTimeout(120_000)
      await page.emulateMedia({ colorScheme })
      await page.addInitScript(() => localStorage.setItem('presmium.publish.contrast', 'high'))
      const failures: string[] = []
      let no = 1
      for (; ; no++) {
        await page.goto(`${SLIDES}/${no}?clicks=99`, { waitUntil: 'networkidle' })
        // Past the last slide, Slidev shows the first one.
        const layout = page.locator(`.slidev-page-${no} .slidev-layout`)
        await expect(layout.or(page.locator('.slidev-page-1 .slidev-layout')).filter({ visible: true }).first()).toBeVisible()
        if (!(await layout.isVisible())) break
        await expect(page.locator('html')).toHaveAttribute('data-pm-contrast', 'high')
        failures.push(...(await lowContrastTexts(layout)).map(text => `slide ${no}: ${text}`))
      }
      expect(no).toBeGreaterThan(10)
      expect(failures).toEqual([])
    })
  }
})

test.describe('web form', () => {
  test.skip(!WEB_BUILT, 'the web form is not built')

  test('once loaded, a web page reloads offline with its remote diagram', async ({ page, context }) => {
    await page.goto(`${WEB}/content.html`)
    await goOffline(page, context)
    await page.reload()
    const diagram = page.locator('.pm-section[data-section="content-sequence"]').getByRole('img', { name: 'PlantUML 图' })
    await expect.poll(() => loaded(diagram)).toBeGreaterThan(0)
    await page.goto(`${WEB}/publish.html`)
    await expect(page.locator('.pm-section[data-section="publish"]')).toContainText('def add(a, b):')
  })

  test('a page that places no switch of its own has the high-contrast switch in the navigation bar', async ({ page }) => {
    await page.goto(`${WEB}/code.html`)
    await expect(page.locator('.vp-doc .pm-contrast-toggle')).toHaveCount(0)
    const toggle = page.getByRole('switch', { name: '高对比度' }).filter({ visible: true })
    await expect(toggle).toHaveCount(1)
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-checked', 'true')
    await expect(page.locator('html')).toHaveAttribute('data-pm-contrast', 'high')
  })

  test('the high-contrast switch of the publish section brings its text to AA', async ({ page }) => {
    await page.goto(`${WEB}/publish.html`)
    const section = page.locator('.pm-section[data-section="publish"]')
    await section.getByRole('switch', { name: '高对比度' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-pm-contrast', 'high')
    await expect.poll(() => lowContrastTexts(section)).toEqual([])
  })
})
