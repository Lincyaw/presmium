import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { SLIDES, WEB } from './urls.ts'

// Built web form (pnpm demo:web) on WEB, built slides form (pnpm demo:build) on SLIDES.
// examples/demo/pages/web.md has a document section "网页形态" and a scrolly section "滚动叙事".

/** Slidev shows this in the overview for a slide without notes. */
const NO_NOTES = 'No notes for this slide'

/** Letters and digits only: the two forms render the same Markdown with different spacing and punctuation. */
const words = (text: string) => text.replace(/[^\p{L}\p{N}]+/gu, '')

/**
 * Every slide of the slides form with its headings and notes, from the documented
 * overview page. Reads text without waiting for elements, since a slide may have no heading.
 */
async function slidesOverview(page: Page) {
  await page.goto(`${SLIDES}/overview`)
  await expect(page.locator('.slidev-page').first()).toBeVisible()
  const count = await page.locator('.slidev-page').count()
  const notes = (await page.locator('.slidev-note').allTextContents()).map(words)
  const slides = []
  for (let no = 1; no <= count; no++) {
    const headings = await page.locator(`.slidev-page-${no}`).locator('h1, h2, h3, h4, h5, h6').allTextContents()
    slides.push({ no, headings: headings.map(words), notes: notes[no - 1] === words(NO_NOTES) ? '' : notes[no - 1]! })
  }
  return slides
}

/** Paths of the web pages, in sidebar order. */
async function webPages(page: Page): Promise<string[]> {
  await page.goto(WEB)
  const hrefs = await page.locator('.VPSidebar a').evaluateAll(links => links.map(a => (a as HTMLAnchorElement).pathname))
  return [...new Set(hrefs)]
}

/** Every section of the web form with its heading and notes, in page order. */
async function webSections(page: Page) {
  const sections = []
  for (const path of await webPages(page)) {
    await page.goto(`${WEB}${path}`)
    sections.push(...await page.locator('.pm-section').evaluateAll(els => els.map((el) => {
      const section = el as HTMLElement
      const heading = [...section.querySelectorAll('h2')].find(h => h.id === section.dataset.anchor)
      // Leave out what VitePress adds around code blocks: the language label and the copy button.
      const notes = section.querySelector('.pm-notes')?.cloneNode(true) as HTMLElement | undefined
      notes?.querySelectorAll('.lang, button').forEach(chrome => chrome.remove())
      return { slide: Number(section.dataset.slide), heading: heading?.textContent ?? '', notes: notes?.textContent ?? '' }
    })))
  }
  return sections.map(s => ({ ...s, heading: words(s.heading), notes: words(s.notes) }))
}

async function openSearch(page: Page) {
  await page.keyboard.press('Control+k')
  const input = page.getByRole('searchbox')
  await expect(input).toBeFocused()
  return input
}

/** Milliseconds from typing `query` until the search results show (the result list must be empty before). */
function timeSearch(page: Page, query: string): Promise<number> {
  return page.evaluate(q => new Promise<number>((resolve) => {
    const input = document.querySelector<HTMLInputElement>('input[type=search]')!
    const start = performance.now()
    input.value = q
    input.dispatchEvent(new Event('input', { bubbles: true }))
    const check = () => (document.querySelector('[role=option]') ? resolve(performance.now() - start) : requestAnimationFrame(check))
    check()
  }), query)
}

test('every slide becomes one web section with its content and notes', async ({ page }) => {
  const slides = await slidesOverview(page)
  const sections = await webSections(page)
  expect(sections.map(s => s.slide)).toEqual(slides.map(s => s.no))
  for (const [i, slide] of slides.entries()) {
    // A slide without a heading gets a generated one; components may render headings of their own.
    if (slide.headings.length > 0) expect(slide.headings, `heading of slide ${slide.no}`).toContain(sections[i]!.heading)
    expect(sections[i]!.notes, `notes of slide ${slide.no}`).toBe(slide.notes)
  }

  // The web page shows both layout slots, code and doc-only content, but no slide-only content.
  await page.goto(`${WEB}/web.html`)
  const section = page.locator('.pm-section', { has: page.locator('h2#网页形态') })
  await expect(section.locator('li', { hasText: '幻灯片与网页一键互跳' })).toBeVisible()
  await expect(section.locator('.pm-slide pre code')).toContainText('toWebDocument(deck)')
  await expect(section.locator('[doc-only]')).toBeVisible()
  await expect(section.locator('[slide-only]')).toBeHidden()
})

test('a Chinese keyword is found within 300 ms and opens its section', async ({ page }) => {
  await page.goto(WEB)
  const input = await openSearch(page)
  // The first query loads the index; time a later one. The time includes VitePress's 200 ms input debounce.
  await input.fill('网页')
  await expect(page.getByRole('option').first()).toBeVisible()
  await input.fill('')
  await expect(page.getByRole('option')).toHaveCount(0)

  expect(await timeSearch(page, '讲稿即正文')).toBeLessThan(300)
  await page.getByRole('option').first().click()
  await expect(page).toHaveURL(/\/web\.html#/)
  await expect(page.locator('h2#网页形态')).toBeInViewport()
})

test('search keeps working offline once the site has loaded', async ({ page, context }) => {
  await page.goto(WEB)
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined))
  await context.setOffline(true)
  expect((await page.reload())?.fromServiceWorker()).toBe(true)
  const input = await openSearch(page)
  // Code blocks are indexed too.
  await input.fill('toWebDocument')
  await page.getByRole('option').first().click()
  await expect(page.locator('h2#网页形态')).toBeInViewport()
})

test('no page scrolls sideways on a 375 px wide phone', async ({ page }) => {
  const paths = await webPages(page)
  await page.setViewportSize({ width: 375, height: 812 })
  for (const path of paths) {
    await page.goto(`${WEB}${path}`)
    await expect(page.locator('.pm-client-only')).toHaveCount(0)
    const [scroll, client] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth])
    expect(scroll, path).toBeLessThanOrEqual(client)
  }
})

test('a scrollytelling section advances its steps with the notes, and back', async ({ page }) => {
  await page.goto(`${WEB}/web.html`)
  const section = page.locator('.pm-section--scrolly')
  const items = section.locator('.pm-v-clicks li')
  const stepper = section.locator('.pm-demo-stepper')
  const scrollTo = (step: number) => section.locator(`.pm-step[data-step="${step}"]`).evaluate(el => el.scrollIntoView({ block: 'center' }))

  await expect(section).toHaveAttribute('data-step', '0')
  await expect(items.first()).toBeHidden()

  await scrollTo(2)
  await expect(section).toHaveAttribute('data-step', '2')
  await expect(items.nth(1)).toBeVisible()
  await expect(items.nth(2)).toBeHidden()
  await expect(stepper).toHaveAttribute('data-step', '2')
  await expect(section.locator('.pm-slide')).toBeInViewport()

  await scrollTo(1)
  await expect(section).toHaveAttribute('data-step', '1')
  await expect(items.nth(1)).toBeHidden()
  await expect(stepper).toHaveAttribute('data-step', '1')
})

test('the two forms open each other at the same slide', async ({ page }) => {
  await page.goto(`${WEB}/web.html`)
  const section = page.locator('.pm-section', { has: page.locator('h2#网页形态') })
  const slide = Number(await section.getAttribute('data-slide'))
  // `$page` of Slidev's global context gives the same number in both forms.
  await expect(section).toContainText(`本页是第 ${slide} 页`)
  await section.getByRole('link', { name: '在幻灯片中打开' }).click()
  await expect(page).toHaveURL(`${SLIDES}/${slide}`)
  await expect(page.locator(`.slidev-page-${slide} h1`)).toHaveText('网页形态')
  await expect(page.locator(`.slidev-page-${slide}`)).toContainText(`本页是第 ${slide} 页`)

  await page.goto(`${SLIDES}/${slide + 1}`)
  await page.getByRole('link', { name: '在网页中阅读' }).click()
  await expect(page).toHaveURL(/\/web\.html#/)
  await expect(page.locator('h2#滚动叙事')).toBeInViewport()
})
