import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import type { Browser, Page } from '@playwright/test'
import { buildDeck, serve } from './fixtures/exec/deck.ts'
import type { BuiltDeck } from './fixtures/exec/deck.ts'

// N-01 and N-02 on a deck of 100 sections, built in beforeAll: the first screen of each
// form shows within 2 s in a fresh browser context, and a step renders within 100 ms of
// its key press. Times are taken in the page: from navigation start, and from the
// keydown's timeStamp to the first animation frame that shows the new state.

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
  - '@presmium/slidev-addon-core'
renderers:
  web: {}
  slides:
    theme: default
---

${Array.from({ length: SECTIONS }, (_, i) => section(i + 1)).join('\n')}`
}

let deck: BuiltDeck
let slides: Awaited<ReturnType<typeof serve>>
let web: Awaited<ReturnType<typeof serve>>

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  test.setTimeout(300_000)
  deck = await buildDeck('perf', (dir) => {
    writeFileSync(join(dir, 'lecture.md'), hundredSections())
    writeFileSync(join(dir, 'package.json'), '{ "private": true, "type": "module" }\n')
  })
  slides = await serve(join(deck.dir, 'dist/slides'), true)
  web = await serve(join(deck.dir, 'dist/web'), false)
})

test.afterAll(async () => {
  await slides?.close()
  await web?.close()
  deck?.remove()
})

/** Milliseconds from navigation start to the first frame in which `selector` is visible, in a fresh context. */
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

/** Milliseconds from the keydown of `key` to the first frame in which `shown()` holds in the page. */
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

test(`the first screen of each form shows within 2 s on a deck of ${SECTIONS} sections (N-01)`, async ({ browser }) => {
  expect(Object.keys(deck.slides)).toHaveLength(SECTIONS)
  const screens = {
    'first slide': await firstRender(browser, `${slides.url}/1`, '.slidev-page-1 .slidev-layout h1'),
    'first web section': await firstRender(browser, `${web.url}/`, '.pm-section[data-section="s1"] h2'),
    'present view': await firstRender(browser, `${web.url}/?view=present`, '.pm-present[data-section="s1"]'),
  }
  test.info().annotations.push({ type: 'first render (ms)', description: JSON.stringify(screens) })
  for (const [screen, ms] of Object.entries(screens)) expect(ms, screen).toBeLessThan(2000)
})

test('a slides click, a slides page turn and a step of the web present view render within 100 ms (N-02)', async ({ page }) => {
  await page.goto(`${slides.url}/50`)
  await expect(page.locator('.slidev-page-50 .slidev-layout h1')).toBeVisible()
  const hidden = '.slidev-page-50 .slidev-vclick-hidden'
  await expect(page.locator(hidden)).toHaveCount(1)
  const click = await keyToFrame(page, 'ArrowRight', `!document.querySelector('${hidden}')`)
  const turn = await keyToFrame(page, 'ArrowRight', `document.querySelector('.slidev-page-51')?.checkVisibility() === true`)

  await page.goto(`${web.url}/?view=present`)
  await expect(page.locator('.pm-present')).toHaveAttribute('data-step', '0')
  const step = await keyToFrame(page, 'ArrowRight', `document.querySelector('.pm-present')?.getAttribute('data-step') === '1'`)

  test.info().annotations.push({ type: 'step render (ms)', description: JSON.stringify({ click, turn, step }) })
  for (const [action, ms] of Object.entries({ click, turn, step })) expect(ms, action).toBeLessThan(100)
})
