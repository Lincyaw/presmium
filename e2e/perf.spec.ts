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
  - '@lincyaw/addon-core'
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
