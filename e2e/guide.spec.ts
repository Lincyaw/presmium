import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { SLIDES } from './urls.ts'

// examples/demo/pages/guide.md: the cursor moves to the query (1), hovers (2) and clicks (3) the
// search button; the results are spotlighted (4); the help button gets a hint (5).
const STEPS = [
  { cursor: '-1:none', mark: '', spotlight: '', hint: '', overlay: '', beacons: 0 },
  { cursor: '0:move', mark: '', spotlight: '', hint: '', overlay: '', beacons: 0 },
  { cursor: '1:hover', mark: 'guide-run=hover', spotlight: '', hint: '', overlay: '', beacons: 0 },
  { cursor: '2:click', mark: 'guide-run=click', spotlight: '', hint: '', overlay: '', beacons: 0 },
  { cursor: '2:click', mark: 'guide-run=click', spotlight: 'guide-output=live', hint: '', overlay: 'guide-output', beacons: 0 },
  { cursor: '2:click', mark: 'guide-run=click', spotlight: '', hint: 'guide-help=live', overlay: '', beacons: 1 },
]
/** Where the cursor tip should be at each step. */
const CURSOR_AT = ['#guide-query', '#guide-query', '#guide-run', '#guide-run', '#guide-run', '#guide-run']

let guideNo: number | undefined

/** Slide number of the guide page, found by walking the built deck slide by slide. */
async function findGuide(page: Page): Promise<number> {
  if (guideNo) return guideNo
  await page.goto(`${SLIDES}/1`)
  for (let no = 1; no <= 50; no++) {
    const layout = page.locator(`.slidev-page-${no} .slidev-layout`).first()
    await expect(layout).toBeVisible()
    if (await layout.evaluate(el => el.classList.contains('pm-guide'))) return (guideNo = no)
    await page.keyboard.press('ArrowDown')
  }
  throw new Error('the demo deck has no guide slide')
}

async function openGuide(page: Page, step: number, view = '') {
  await page.goto(`${SLIDES}${view}/${await findGuide(page)}?clicks=${step}`)
  await expect(page.locator('.slidev-layout.pm-guide .pm-cursor').first()).toBeAttached()
}

/** What the cues show on the audience's slide: cursor waypoint and action, target marks, page-level effects. */
function cues(page: Page) {
  return page.evaluate(() => {
    const slide = document.querySelector('.slidev-layout.pm-guide')!
    const cursor = slide.querySelector<HTMLElement>('.pm-cursor')!
    const marks = (attribute: string) => [...slide.querySelectorAll(`[${attribute}]`)].map(el => `${el.id}=${el.getAttribute(attribute)}`).join(' ')
    return {
      cursor: `${cursor.dataset.waypoint}:${cursor.dataset.action}`,
      mark: marks('data-pm-cursor'),
      spotlight: marks('data-pm-spotlight'),
      hint: marks('data-pm-hint'),
      overlay: document.querySelector('.driver-overlay') ? document.querySelector('.driver-active-element')?.id : '',
      beacons: document.querySelectorAll('.driver-hint.pm-hint-beacon').length,
    }
  })
}

/** Distance in pixels from the cursor tip to the centre of `selector`. */
function cursorOffset(page: Page, selector: string) {
  return page.evaluate((selector) => {
    const slide = document.querySelector('.slidev-layout.pm-guide')!
    const tip = slide.querySelector('.pm-cursor')!.getBoundingClientRect()
    const box = slide.querySelector(selector)!.getBoundingClientRect()
    return Math.hypot(tip.x - (box.x + box.width / 2), tip.y - (box.y + box.height / 2))
  }, selector)
}

const animations = (page: Page, selector: string) =>
  page.locator(selector).first().evaluate(el => el.getAnimations({ subtree: true }).length)

test('each step puts the cursor, spotlight and hint where the deck declares them', async ({ page }) => {
  await openGuide(page, 0)
  for (const [step, expected] of STEPS.entries()) {
    if (step > 0) await page.keyboard.press('ArrowRight')
    await expect.poll(() => cues(page)).toEqual(expected)
    if (step > 0) await expect.poll(() => cursorOffset(page, CURSOR_AT[step]!)).toBeLessThan(1)
    if (step === 3) expect(await animations(page, '.pm-guide .pm-cursor__ring')).toBe(1)
    if (step === 4) {
      // The page is dimmed around the results, with the spotlight's popover.
      await expect(page.locator('.pm-spotlight-popover .driver-popover-title')).toHaveText('搜索结果')
      await expect(page.locator('body')).toHaveClass(/driver-fade/)
    }
  }

  // Step 5: the beacon pulses on the help button's corner and opens its explanation.
  const beacon = page.locator('.driver-hint.pm-hint-beacon')
  const help = (await page.locator('.pm-guide #guide-help').boundingBox())!
  const dot = (await beacon.boundingBox())!
  expect(Math.abs(dot.x + dot.width / 2 - (help.x + help.width))).toBeLessThan(2)
  expect(Math.abs(dot.y + dot.height / 2 - help.y)).toBeLessThan(2)
  expect(await animations(page, '.pm-hint-beacon')).toBeGreaterThan(0)
  await beacon.click()
  await expect(page.locator('.driver-hint-popover .driver-popover-title')).toHaveText('帮助')
})

test('stepping back undoes every cue and leaves the slide as a direct jump does', async ({ page }) => {
  await openGuide(page, 0)
  await expect.poll(() => cues(page)).toEqual(STEPS[0])
  const fresh = await page.locator('.slidev-layout.pm-guide').innerHTML()

  await openGuide(page, STEPS.length - 1)
  for (let step = STEPS.length - 1; step >= 0; step--) {
    await expect.poll(() => cues(page)).toEqual(STEPS[step])
    await expect.poll(() => cursorOffset(page, CURSOR_AT[step]!)).toBeLessThan(1)
    if (step > 0) await page.keyboard.press('ArrowLeft')
  }
  expect(await page.locator('.slidev-layout.pm-guide').innerHTML()).toBe(fresh)
})

test('with reduced motion every cue shows its final state at once', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await openGuide(page, 0)
  // No polling below: each state must hold as soon as the step is taken.
  for (const step of [1, 2, 3]) {
    await page.keyboard.press('ArrowRight')
    await expect.poll(() => cues(page)).toEqual(STEPS[step])
    expect(await cursorOffset(page, CURSOR_AT[step]!)).toBeLessThan(1)
    expect(await animations(page, '.pm-guide .pm-cursor')).toBe(0)
  }
  await expect(page.locator('.pm-guide .pm-cursor__ring')).toHaveCSS('opacity', '0.7')

  await page.keyboard.press('ArrowRight')
  await expect.poll(() => cues(page)).toEqual(STEPS[4])
  await expect(page.locator('body')).toHaveClass(/driver-simple/)
  expect(await animations(page, '.driver-overlay')).toBe(0)

  await page.keyboard.press('ArrowRight')
  await expect.poll(() => cues(page)).toEqual(STEPS[5])
  await expect(page.locator('.pm-hint-beacon')).toHaveClass(/driver-hint-no-animation/)
  expect(await animations(page, '.pm-hint-beacon')).toBe(0)
})

test('the presenter view shows the cues in its slides instead of covering the page', async ({ page }) => {
  await openGuide(page, 4, '/presenter')
  // The current slide shows the spotlight in place; the next-step preview shows the hint.
  await expect(page.locator('[data-pm-spotlight]')).toHaveAttribute('data-pm-spotlight', 'inline')
  await expect(page.locator('[data-pm-hint]')).toHaveAttribute('data-pm-hint', 'inline')
  await expect(page.locator('.driver-overlay')).toHaveCount(0)
  await expect(page.locator('.driver-hint')).toHaveCount(0)
})
