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
