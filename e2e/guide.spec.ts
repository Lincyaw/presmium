import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { useFixture } from './fixtures/deck.ts'

test.describe.configure({ mode: 'default' })
const deck = useFixture('guide')
const STEPS = [
  { cursor: '-1:none', mark: '', spotlight: '', hint: '', overlay: '', beacons: 0 },
  { cursor: '0:move', mark: '', spotlight: '', hint: '', overlay: '', beacons: 0 },
  { cursor: '1:hover', mark: 'guide-run=hover', spotlight: '', hint: '', overlay: '', beacons: 0 },
  { cursor: '2:click', mark: 'guide-run=click', spotlight: '', hint: '', overlay: '', beacons: 0 },
  { cursor: '2:click', mark: 'guide-run=click', spotlight: 'guide-output=stage', hint: '', overlay: 'guide-output', beacons: 0 },
  { cursor: '2:click', mark: 'guide-run=click', spotlight: '', hint: 'guide-help=stage', overlay: '', beacons: 1 },
]
const CURSOR_AT = ['#guide-query', '#guide-query', '#guide-run', '#guide-run', '#guide-run', '#guide-run']

async function openGuide(page: Page, step: number, view = '') {
  await page.goto(`${deck().slides}${view}/${deck().slide('guide')}?clicks=${step}`)
  await expect(page.locator('.slidev-layout.pm-guide .pm-cursor').first()).toBeAttached()
}

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

function cursorOffset(page: Page, selector: string) {
  return page.evaluate((selector) => {
    const slide = document.querySelector('.slidev-layout.pm-guide')!
    const tip = slide.querySelector('.pm-cursor')!.getBoundingClientRect()
    const box = slide.querySelector(selector)!.getBoundingClientRect()
    return Math.hypot(tip.x - (box.x + box.width / 2), tip.y - (box.y + box.height / 2))
  }, selector)
}

function spotlightFits(page: Page, slide = '.pm-guide') {
  return page.evaluate((slide) => {
    const path = document.querySelector<SVGPathElement>('.driver-overlay path')
    const box = document.querySelector(`${slide} #guide-output`)!.getBoundingClientRect()
    const dimmed = ([x, y]: number[]) => !!path?.isPointInFill(new DOMPoint(x, y))
    const inside = [[box.left + 2, box.top + 2], [box.right - 2, box.bottom - 2]]
    const outside = [[box.left - 20, box.top], [box.right + 20, box.bottom], [box.left, box.top - 20], [box.right, box.bottom + 20]]
    return !inside.some(dimmed) && outside.every(dimmed)
  }, slide)
}

function beaconOffset(page: Page) {
  return page.evaluate(() => {
    const dot = document.querySelector('.driver-hint.pm-hint-beacon')!.getBoundingClientRect()
    const help = document.querySelector('.pm-guide #guide-help')!.getBoundingClientRect()
    return Math.hypot(dot.x + dot.width / 2 - help.right, dot.y + dot.height / 2 - help.top)
  })
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
      await expect.poll(() => spotlightFits(page)).toBe(true)
      await expect(page.locator('.pm-spotlight-popover .driver-popover-title')).toHaveText('搜索结果')
      await expect(page.locator('body')).toHaveClass(/driver-fade/)
    }
  }

  const beacon = page.locator('.driver-hint.pm-hint-beacon')
  const popover = page.locator('.pm-hint-popover .driver-popover-title')
  await expect.poll(() => beaconOffset(page)).toBeLessThan(2)
  expect(await animations(page, '.pm-hint-beacon')).toBeGreaterThan(0)
  await beacon.click()
  await expect(popover).toHaveText('帮助')

  await page.keyboard.press('ArrowLeft')
  await expect.poll(() => cues(page)).toEqual(STEPS[4])
  await expect(popover).toHaveCount(0)
  await page.keyboard.press('ArrowRight')
  await beacon.click()
  await expect(popover).toHaveText('帮助')
  await page.keyboard.press('Escape')
  await expect(popover).toHaveCount(0)
  await page.keyboard.press('ArrowLeft')
  await expect.poll(() => cues(page)).toEqual(STEPS[4])
})

test('the spotlight and the beacon follow their targets when the window is resized', async ({ page }) => {
  await openGuide(page, 4)
  await expect.poll(() => spotlightFits(page)).toBe(true)
  await page.setViewportSize({ width: 900, height: 900 })
  await expect.poll(() => spotlightFits(page)).toBe(true)

  await page.keyboard.press('ArrowRight')
  await expect.poll(() => cues(page)).toEqual(STEPS[5])
  await expect.poll(() => beaconOffset(page)).toBeLessThan(2)
  await page.setViewportSize({ width: 1280, height: 720 })
  await expect.poll(() => beaconOffset(page)).toBeLessThan(2)
})

test('under the spotlight the host navigation and overview stay on top and usable', async ({ page }) => {
  await openGuide(page, 4)
  await expect.poll(() => cues(page)).toEqual(STEPS[4])
  const nav = (name: string) => page.getByRole('button', { name }).click()
  await nav('Go to next slide')
  await expect.poll(() => cues(page)).toEqual(STEPS[5])
  await nav('Go to previous slide')
  await expect.poll(() => cues(page)).toEqual(STEPS[4])

  const popover = (await page.locator('.pm-spotlight-popover').boundingBox())!
  await nav('Show slide overview')
  const first = page.locator('.slidev-page-1').last()
  await expect(first).toBeVisible()
  const covered = await page.evaluate(({ x, y }) => !document.elementFromPoint(x, y)?.closest('.driver-popover'), { x: popover.x + popover.width / 2, y: popover.y + popover.height / 2 })
  expect(covered).toBe(true)
  const thumbnail = (await first.boundingBox())!
  await page.mouse.click(thumbnail.x + thumbnail.width / 2, thumbnail.y + thumbnail.height / 2)
  await expect(page).toHaveURL(/\/1(\?|$)/)
})

test('stepping back undoes every cue and leaves the slide as a direct jump does', async ({ page }) => {
  const slide = () => page.locator('.slidev-layout.pm-guide').evaluate((layout) => {
    const copy = layout.cloneNode(true) as HTMLElement
    for (const cursor of copy.querySelectorAll<HTMLElement>('.pm-cursor')) cursor.style.removeProperty('transform')
    return copy.innerHTML
  })
  await openGuide(page, 0)
  await expect.poll(() => cues(page)).toEqual(STEPS[0])
  await expect.poll(() => cursorOffset(page, CURSOR_AT[0]!)).toBeLessThan(1)
  const fresh = await slide()

  await openGuide(page, STEPS.length - 1)
  for (let step = STEPS.length - 1; step >= 0; step--) {
    await expect.poll(() => cues(page)).toEqual(STEPS[step])
    await expect.poll(() => cursorOffset(page, CURSOR_AT[step]!)).toBeLessThan(1)
    if (step > 0) await page.keyboard.press('ArrowLeft')
  }
  expect(await slide()).toBe(fresh)
})

test('with reduced motion every cue shows its final state at once', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await openGuide(page, 0)
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
  await expect(page.locator('[data-pm-spotlight]')).toHaveAttribute('data-pm-spotlight', 'inline')
  await expect(page.locator('[data-pm-hint]')).toHaveAttribute('data-pm-hint', 'inline')
  await expect(page.locator('.driver-overlay')).toHaveCount(0)
  await expect(page.locator('.driver-hint')).toHaveCount(0)
})

test('under the spotlight, Tab moves the focus to the spotlit element and the keys still page (N-06)', async ({ page }) => {
  await openGuide(page, 4)
  await expect.poll(() => cues(page)).toEqual(STEPS[4])
  const output = page.locator('.pm-guide #guide-output')
  await page.keyboard.press('Tab')
  await expect(output).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(output).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(output).toBeFocused()

  await page.keyboard.press('ArrowRight')
  await expect.poll(() => cues(page)).toEqual(STEPS[5])
  await expect(output).not.toHaveAttribute('tabindex')
  await page.keyboard.press('ArrowLeft')
  await expect.poll(() => cues(page)).toEqual(STEPS[4])
})

test('in the web form the cues follow the steps of the present view, which draws them over the page', async ({ page }) => {
  await page.goto(`${deck().web}/guide.html`)
  const section = page.locator('.pm-section[data-section="guide"]')
  await expect(section.locator('#guide-run')).toHaveAttribute('data-pm-cursor', 'click')
  await expect(section.locator('[data-pm-spotlight], [data-pm-hint]')).toHaveCount(0)
  await expect(section.locator('.pm-cue-note')).toHaveText(['搜索结果：点击搜索后，结果出现在这里。', '帮助：不确定关键字怎么写时，点这里查看语法。'])

  await page.getByRole('combobox', { name: '视图' }).selectOption('present')
  const present = page.getByRole('region', { name: '放映' })
  await expect(present).toHaveAttribute('data-section', 'guide')
  const marks = () => present.evaluate((el) => {
    const marked = (attribute: string) => [...el.querySelectorAll(`[${attribute}]`)].map(e => `${e.id}=${e.getAttribute(attribute)}`).join(' ')
    return { cursor: marked('data-pm-cursor'), spotlight: marked('data-pm-spotlight'), hint: marked('data-pm-hint') }
  })
  const expected = [
    { cursor: '', spotlight: '', hint: '' },
    { cursor: '', spotlight: '', hint: '' },
    { cursor: 'guide-run=hover', spotlight: '', hint: '' },
    { cursor: 'guide-run=click', spotlight: '', hint: '' },
    { cursor: 'guide-run=click', spotlight: 'guide-output=stage', hint: '' },
    { cursor: 'guide-run=click', spotlight: '', hint: 'guide-help=stage' },
  ]
  for (const [step, marked] of expected.entries()) {
    if (step > 0) await page.keyboard.press('ArrowRight')
    await expect(present).toHaveAttribute('data-step', String(step))
    await expect.poll(marks).toEqual(marked)
    if (step === 4) {
      await expect.poll(() => spotlightFits(page, '.pm-present')).toBe(true)
      await expect(page.locator('.pm-spotlight-popover .driver-popover-title')).toHaveText('搜索结果')
      await expect(page.locator('.pm-spotlight-popover .driver-popover-description')).toHaveText('点击搜索后，结果出现在这里。')
    }
  }
  await page.locator('.driver-hint.pm-hint-beacon').click()
  await expect(page.locator('.pm-hint-popover .driver-popover-title')).toHaveText('帮助')
  for (let step = expected.length - 2; step >= 0; step--) {
    await page.keyboard.press('ArrowLeft')
    await expect.poll(marks).toEqual(expected[step])
  }
})

test('in the web form\'s scrolly view a cue explains its target while it is active', async ({ page }) => {
  await page.goto(`${deck().web}/guide.html`)
  await page.getByRole('combobox', { name: '视图' }).selectOption('scrolly')
  const section = page.locator('.pm-section[data-section="guide"]')
  const notes = section.locator('.pm-cue-note')
  const step = async (k: number) => {
    await expect(async () => {
      await section.locator(`.pm-step[data-step="${k}"]`).evaluate(el => el.scrollIntoView({ block: 'center' }))
      await expect(section).toHaveAttribute('data-step', String(k), { timeout: 500 })
    }).toPass()
  }
  await step(4)
  await expect(section.locator('#guide-output')).toHaveAttribute('data-pm-spotlight', 'inline')
  await expect(notes.nth(0)).toHaveAttribute('data-state', 'shown')
  await expect(notes.nth(1)).toHaveAttribute('data-state', 'hidden')
  await step(5)
  await expect(notes.nth(0)).toHaveAttribute('data-state', 'hidden')
  await expect(notes.nth(1)).toHaveAttribute('data-state', 'shown')
})

test('without JavaScript the page has no empty board, and loading it moves nothing', async ({ browser }) => {
  const height = async (javaScriptEnabled: boolean) => {
    const context = await browser.newContext({ javaScriptEnabled })
    const page = await context.newPage()
    await page.goto(`${deck().web}/guide.html`)
    const section = page.locator('.pm-section[data-section="guide"]')
    if (javaScriptEnabled) {
      await expect(section.locator('.pm-client-only')).toHaveCount(0)
      await expect(section.locator('.pm-cue-note')).toHaveCount(2)
    } else {
      const empty = await page.locator('.pm-board').evaluateAll(boards => boards.filter(board => !board.textContent?.trim()).length)
      expect(empty).toBe(0)
      await expect(section).toContainText('点击搜索后，结果出现在这里。')
    }
    await page.waitForLoadState('networkidle')
    const box = await section.evaluate(el => Math.round(el.getBoundingClientRect().height))
    await context.close()
    return box
  }
  expect(await height(true)).toBe(await height(false))
})

test('a cue that keeps still stops reading its target on every frame', async ({ page }) => {
  await openGuide(page, 5)
  await expect.poll(() => cues(page)).toEqual(STEPS[5])
  await page.waitForTimeout(2000)
  const frames = await page.evaluate(async () => {
    let calls = 0
    const native = window.requestAnimationFrame
    window.requestAnimationFrame = (callback) => {
      calls++
      return native(callback)
    }
    await new Promise(resolve => setTimeout(resolve, 1000))
    window.requestAnimationFrame = native
    return calls
  })
  expect(frames).toBe(0)
  await page.setViewportSize({ width: 900, height: 900 })
  await expect.poll(() => beaconOffset(page)).toBeLessThan(2)
})
