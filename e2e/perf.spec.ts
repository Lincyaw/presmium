import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import type { Browser, Page } from '@playwright/test'
import { buildFixture, serve } from './fixtures/deck.ts'
import type { FixtureDeck } from './fixtures/deck.ts'
import { buildDeck } from './fixtures/exec/deck.ts'
import type { BuiltDeck } from './fixtures/exec/deck.ts'

const SECTIONS = 100

function hundredSections(): string {
  const section = (n: number) => `(s${n})=
## Section ${n}

Narration of section ${n}.

:::{slide}
Shown on section ${n}.
:::

:::{slide}
:reveal:
Revealed on section ${n}.
:::

\`\`\`python
def section_${n}(x):
    return x * ${n}
\`\`\`
`
  return `---
title: Performance
plugins:
  - '@lincyaw/slidev-addon-core'
renderers:
  web: {}
  slides:
    theme: default
---

${Array.from({ length: SECTIONS }, (_, i) => section(i + 1)).join('\n')}`
}

let deck: BuiltDeck
let site: Awaited<ReturnType<typeof serve>>
let slides = ''
let web = ''
let guide: FixtureDeck
let heavy: FixtureDeck

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  test.setTimeout(300_000)
  deck = await buildDeck('perf', (dir) => {
    writeFileSync(join(dir, 'lecture.md'), hundredSections())
    writeFileSync(join(dir, 'package.json'), '{ "private": true, "type": "module" }\n')
  })
  site = await serve(join(deck.dir, 'dist'), '/slides/')
  slides = `${site.url}/slides`
  web = `${site.url}/web`
  guide = await buildFixture('guide')
  heavy = await buildFixture('content/heavy', { to: 'slides' })
})

test.afterAll(async () => {
  await site?.close()
  deck?.remove()
  await guide?.close()
  await heavy?.close()
})

async function firstRender(browser: Browser, url: string, selector: string): Promise<number> {
  const context = await browser.newContext()
  try {
    const page = await context.newPage()
    await page.addInitScript((target) => {
      const poll = () => {
        if (document.querySelector(target)?.checkVisibility()) Object.assign(window, { pmVisibleAt: performance.now() })
        else requestAnimationFrame(poll)
      }
      requestAnimationFrame(poll)
    }, selector)
    await page.goto(url)
    return await (await page.waitForFunction(() => (window as { pmVisibleAt?: number }).pmVisibleAt)).jsonValue() as number
  } finally {
    await context.close()
  }
}

async function keyToFrame(page: Page, key: string, shown: string): Promise<number> {
  await page.evaluate((condition) => {
    const holds = new Function(`return (${condition})`) as () => boolean
    Object.assign(window, {
      pmFrame: new Promise<number>((resolve) => {
        addEventListener('keydown', (event) => {
          const poll = (now: number) => (holds() ? resolve(now - event.timeStamp) : requestAnimationFrame(poll))
          requestAnimationFrame(poll)
        }, { once: true, capture: true })
      }),
    })
  }, shown)
  await page.keyboard.press(key)
  return page.evaluate(() => (window as { pmFrame?: Promise<number> }).pmFrame!)
}

test(`the first screen of each form shows within 2 s on a deck of ${SECTIONS} sections`, async ({ browser }) => {
  expect(Object.keys(deck.slides)).toHaveLength(SECTIONS)
  const screens = {
    'first slide': await firstRender(browser, `${slides}/1`, '.slidev-page-1 .slidev-layout h1'),
    'first web section': await firstRender(browser, `${web}/`, '.pm-section[data-section="s1"] h2'),
    'present view': await firstRender(browser, `${web}/?view=present`, '.pm-present[data-section="s1"]'),
  }
  test.info().annotations.push({ type: 'first render (ms)', description: JSON.stringify(screens) })
  for (const [screen, ms] of Object.entries(screens)) expect(ms, screen).toBeLessThan(2000)
})

test('a slides click, a slides page turn and a step of the web present view render within 100 ms', async ({ page }) => {
  await page.goto(`${slides}/50`)
  await expect(page.locator('.slidev-page-50 .slidev-layout h1')).toBeVisible()
  const hidden = '.slidev-page-50 .slidev-vclick-hidden'
  await expect(page.locator(hidden)).toHaveCount(1)
  const click = await keyToFrame(page, 'ArrowRight', `!document.querySelector('${hidden}')`)
  const turn = await keyToFrame(page, 'ArrowRight', `document.querySelector('.slidev-page-51')?.checkVisibility() === true`)

  await page.goto(`${web}/?view=present`)
  await expect(page.locator('.pm-present')).toHaveAttribute('data-step', '0')
  const step = await keyToFrame(page, 'ArrowRight', `document.querySelector('.pm-present')?.getAttribute('data-step') === '1'`)

  test.info().annotations.push({ type: 'step render (ms)', description: JSON.stringify({ click, turn, step }) })
  for (const [action, ms] of Object.entries({ click, turn, step })) expect(ms, action).toBeLessThan(100)
})

test('on slides with a Monaco runner, a flowchart and a mind map, a key press is painted within 100 ms, as the browser times it', async ({ page }) => {
  await page.addInitScript(() => {
    const keys: { duration: number, slide: string }[] = []
    Object.assign(window, { pmKeys: keys })
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name === 'keydown') keys.push({ duration: entry.duration, slide: location.pathname })
      }
    }).observe({ type: 'event', durationThreshold: 16, buffered: true } as PerformanceObserverInit)
  })
  await page.goto(`${heavy.slides}/1`)
  await expect(page.locator('.slidev-page-1 .slidev-layout h1')).toBeVisible()
  const last = heavy.doc.sections.length
  const drawn: Record<string, string> = { 'heavy-runner': '.monaco-editor', 'heavy-flow': 'svg', 'heavy-map': 'svg' }
  for (let no = 1; no <= last; no++) {
    const section = heavy.doc.sections[no - 1]!
    const slide = page.locator(`.slidev-page-${no}`)
    await expect(slide).toBeVisible()
    if (drawn[section.id]) await expect(slide.locator(drawn[section.id]!).first()).toBeVisible({ timeout: 30_000 })
    await page.waitForTimeout(300)
    for (let click = 0; click <= section.steps && no < last; click++) {
      await page.keyboard.press('ArrowRight')
      await page.waitForTimeout(300)
    }
  }
  const keys = await page.evaluate(() => (window as { pmKeys?: { duration: number, slide: string }[] }).pmKeys!)
  test.info().annotations.push({ type: 'keydown to paint (ms, 16 and over)', description: JSON.stringify(keys) })
  for (const key of keys) expect(key.duration, `a key press on ${key.slide}`).toBeLessThan(100)
})

async function frameIntervals(page: Page, act: () => Promise<void>): Promise<number[]> {
  await page.evaluate(() => {
    const times: number[] = []
    Object.assign(window, { pmFrames: times })
    const tick = (now: number) => {
      times.push(now)
      if ((window as { pmFrames?: number[] }).pmFrames === times) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  await act()
  return page.evaluate(() => {
    const times = (window as { pmFrames?: number[] }).pmFrames!
    Object.assign(window, { pmFrames: undefined })
    return times.slice(1).map((time, i) => time - times[i]!)
  })
}

function p95(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(0.95 * (sorted.length - 1))]!
}

test('the guidance cursor of the present view and the slides\' page turns keep 60 frames a second', async ({ page }) => {
  await page.goto(`${guide.web}/guide.html?view=present&section=guide&step=0`)
  const present = page.locator('.pm-present')
  await expect(present.locator('.pm-cursor')).toBeAttached()
  const cursor = await frameIntervals(page, async () => {
    for (const step of [1, 2, 3]) {
      await page.keyboard.press('ArrowRight')
      await expect(present).toHaveAttribute('data-step', String(step))
      await page.waitForTimeout(700)
    }
  })

  await page.goto(`${slides}/20`)
  await expect(page.locator('.slidev-page-20 .slidev-layout h1')).toBeVisible()
  const turns = await frameIntervals(page, async () => {
    for (const no of [21, 22, 23]) {
      await page.keyboard.press('ArrowRight')
      await page.keyboard.press('ArrowRight')
      await expect(page.locator(`.slidev-page-${no}`)).toBeVisible()
      await page.waitForTimeout(500)
    }
  })

  const p95s = { cursor: p95(cursor), turns: p95(turns) }
  test.info().annotations.push({ type: 'frame interval p95 (ms)', description: JSON.stringify(p95s) })
  for (const [action, ms] of Object.entries(p95s)) expect(ms, action).toBeLessThanOrEqual(20)
})
