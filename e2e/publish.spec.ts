import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import type { BrowserContext, Locator, Page } from '@playwright/test'
import { useFixture } from './fixtures/deck.ts'

test.describe.configure({ mode: 'default' })
const deck = useFixture('publish', { with: ['host', 'stage', 'code', 'exec/panels', 'exec-local', 'guide', 'content', 'session', 'plugins/classroom.md'], link: { '@lincyaw/host': 'packages/host' } })
const slides = (path: string | number) => `${deck().slides}/${path}`

async function openPublish(page: Page): Promise<Locator> {
  await page.goto(slides('publish'))
  const slide = page.locator('.slidev-layout.pm-publish').first()
  await expect(slide.locator('h1')).toHaveText('发布')
  return slide
}

async function goOffline(page: Page, context: BrowserContext) {
  test.setTimeout(Math.max(test.info().timeout, 180_000))
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  await context.setOffline(true)
  if (context.browser()?.browserType().name() === 'chromium') await (await context.newCDPSession(page)).send('Network.clearBrowserCache')
}

async function controlled(page: Page) {
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
}

const loaded = (image: Locator) => image.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth)

const RUNTIME = { timeout: 60_000 }

async function checkExercise(exercise: Locator): Promise<void> {
  await exercise.getByRole('button', { name: '提交' }).click()
  await expect(exercise.locator('.pm-exercise__verdict')).toHaveText('未通过 1/2', RUNTIME)
  await expect(exercise.locator('.pm-exercise__report')).toHaveAttribute('data-executor', 'pyodide')
}

test('once loaded, the built deck reloads and plays offline, remote diagrams included', async ({ page, context }) => {
  await openPublish(page)
  await goOffline(page, context)
  const slide = await openPublish(page)
  await expect(slide.locator('pre.shiki')).toContainText('def add(a, b):')
  await page.keyboard.press('ArrowLeft')
  await expect(page).not.toHaveURL(slides('publish'))
  await expect(slide).toBeHidden()
  await expect(page.locator('.slidev-layout:visible h1')).toBeVisible()
  await page.goto(slides(1))
  await expect(page.locator('.slidev-page-1 .slidev-layout h1')).toHaveText('Presmium 功能测试文稿')
  await page.goto(slides('content-sequence'))
  await expect.poll(() => loaded(page.locator('.slidev-layout.pm-content-sequence').getByRole('img', { name: 'PlantUML 图' }))).toBeGreaterThan(0)
})

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
      const style = getComputedStyle(parent)
      const fg = rgba(parent instanceof SVGElement ? style.fill : style.color)
      texts.push({ text: node.textContent.trim(), fg: over([fg[0]!, fg[1]!, fg[2]!, fg[3]! * opacity], bg), bg })
    }
    return texts
  })
}

function contrast(a: number[], b: number[]): number {
  const luminance = (rgb: number[]) => {
    const [r, g, bl] = rgb.slice(0, 3).map(v => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4))
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!
  }
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi! + 0.05) / (lo! + 0.05)
}

async function lowContrastTexts(slide: Locator): Promise<string[]> {
  const texts = await textColors(slide)
  expect(texts.length).toBeGreaterThan(0)
  return texts.filter(t => contrast(t.fg, t.bg) < 4.5).map(t => `${t.text} (${contrast(t.fg, t.bg).toFixed(2)})`)
}

test('offline, the slides still run Python: the service worker keeps the Pyodide runtime', async ({ page, context }) => {
  await page.goto(slides(deck().slide('classroom-exercise')))
  await goOffline(page, context)
  await page.reload()
  await checkExercise(page.locator('.slidev-layout .pm-exercise').filter({ visible: true }))
})

test('the high-contrast switch brings the text of the slide to WCAG AA and is remembered', async ({ page }) => {
  const slide = await openPublish(page)
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
  await page.goto(slides('content-diagrams'))
  const slide = page.locator('.slidev-layout.pm-content-diagrams')
  const label = slide.locator('.mermaid .edgeLabel p').first()
  await expect(label).toHaveText('幻灯片')
  expect((await lowContrastTexts(slide)).some(text => text.startsWith('幻灯片'))).toBe(true)

  await page.getByRole('switch', { name: '高对比度' }).filter({ visible: true }).first().click()
  await expect(page.locator('html')).toHaveAttribute('data-pm-contrast', 'high')
  await expect.poll(() => lowContrastTexts(slide)).toEqual([])
})

test('high contrast keeps the opacity that other plugins give their step states', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('presmium.publish.contrast', 'high'))
  await page.goto(slides(`${deck().slide('guide')}?clicks=0`))
  await expect(page.locator('html')).toHaveAttribute('data-pm-contrast', 'high')
  await expect(page.locator('.slidev-layout.pm-guide .pm-cursor')).toHaveCSS('opacity', '0')
})

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
        await page.goto(slides(`${no}?clicks=99`), { waitUntil: 'networkidle' })
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
  test('once loaded, a web page reloads offline with its remote diagram', async ({ page, context }) => {
    await page.goto(`${deck().web}/content.html`)
    await goOffline(page, context)
    await page.reload()
    const diagram = page.locator('.pm-section[data-section="content-sequence"]').getByRole('img', { name: 'PlantUML 图' })
    await expect.poll(() => loaded(diagram)).toBeGreaterThan(0)
    await page.goto(`${deck().web}/publish.html`)
    await expect(page.locator('.pm-section[data-section="publish"]')).toContainText('def add(a, b):')
  })

  test('offline, a web page still runs Python once it has run it: the service worker keeps the Pyodide runtime', async ({ page, context }) => {
    await page.goto(`${deck().web}/classroom.html`)
    const exercise = page.locator('.pm-section[data-section="classroom-exercise"] .pm-exercise')
    await controlled(page)
    await checkExercise(exercise)
    await goOffline(page, context)
    await page.reload()
    await checkExercise(exercise)
  })

  test('a page that places no switch of its own has the high-contrast switch in the navigation bar', async ({ page }) => {
    await page.goto(`${deck().web}/code.html`)
    await expect(page.locator('.vp-doc .pm-contrast-toggle')).toHaveCount(0)
    const toggle = page.getByRole('switch', { name: '高对比度' }).filter({ visible: true })
    await expect(toggle).toHaveCount(1)
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-checked', 'true')
    await expect(page.locator('html')).toHaveAttribute('data-pm-contrast', 'high')
  })

  test.describe('every page', () => {
    test.use({ serviceWorkers: 'block' })

    for (const colorScheme of ['light', 'dark'] as const) {
      test(`in high contrast, every page of the web form reaches WCAG AA, the dimmed narration of a scrolling section included (${colorScheme})`, async ({ page }) => {
        test.setTimeout(240_000)
        await page.emulateMedia({ colorScheme })
        await page.addInitScript(() => localStorage.setItem('presmium.publish.contrast', 'high'))
        const pages = readdirSync(join(deck().dir, 'dist/web')).filter(file => file.endsWith('.html') && file !== '404.html').sort()
        expect(pages.length).toBeGreaterThan(3)
        const failures: string[] = []
        let dimmed = 0
        for (const file of pages) {
          await page.goto(`${deck().web}/${file}`, { waitUntil: 'networkidle' })
          const content = page.locator('.vp-doc:not(.pm-overlay-views)')
          await expect(content).toBeVisible()
          await expect(page.locator('html')).toHaveAttribute('data-pm-contrast', 'high')
          dimmed += await page.locator('.pm-section--scrolly > .pm-track .pm-block--narration.pm-hidden').count()
          failures.push(...(await lowContrastTexts(content)).map(text => `${file}: ${text}`))
        }
        expect(dimmed).toBeGreaterThan(0)
        expect(failures).toEqual([])
      })
    }
  })

  test('the high-contrast switch of the publish section brings its text to AA', async ({ page }) => {
    await page.goto(`${deck().web}/publish.html`)
    const section = page.locator('.pm-section[data-section="publish"]')
    await section.getByRole('switch', { name: '高对比度' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-pm-contrast', 'high')
    await expect.poll(() => lowContrastTexts(section)).toEqual([])
  })
})

test.describe('web form, offline runtimes', () => {
  const wasi = useFixture('exec-wasi', {
    to: 'web',
    link: { '@lincyaw/slidev-addon-exec-wasi': 'packages/addon-exec-wasi' },
    edit: dir => writeFileSync(join(dir, 'lecture.md'), readFileSync(join(dir, 'lecture.md'), 'utf8')
      .replace("  - '@lincyaw/slidev-addon-exec-wasi'\n", "  - '@lincyaw/slidev-addon-exec-wasi'\n  - '@lincyaw/slidev-addon-publish'\n")),
  })

  test('a first visit caches no C compiler; once saved for offline use, C runs offline', async ({ page, context }) => {
    test.setTimeout(300_000)
    await page.goto(`${wasi().web}/?section=c-program`)
    await controlled(page)
    const cached = () => page.evaluate(async () => (await Promise.all((await caches.keys()).map(async name => (await (await caches.open(name)).keys()).map(r => r.url)))).flat())
    expect((await cached()).some(url => url.endsWith('/clang.wasm'))).toBe(false)
    const save = page.locator('.pm-save-offline').filter({ visible: true }).first()
    await expect(save).toHaveAttribute('data-state', 'offered')
    await save.click()
    await expect(save).toHaveAttribute('data-state', 'saved', { timeout: 120_000 })
    expect((await cached()).some(url => url.endsWith('/clang.wasm'))).toBe(true)

    await goOffline(page, context)
    expect((await page.reload())?.fromServiceWorker()).toBe(true)
    const block = page.locator('.pm-block[data-block="sum"]')
    await block.locator('.pm-code-block__run button').first().click()
    await expect(block.locator('.pm-outputs')).toHaveAttribute('data-source', 'live', { timeout: 120_000 })
    await expect(block.locator('.pm-output__stdout')).toHaveText('1 + 2 + ... + 100 = 5050')
  })
})
