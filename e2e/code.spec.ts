import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { useFixture } from './fixtures/deck.ts'

// e2e/fixtures/code: references to e2e/fixtures/code/cart.ts, pinned to commits of its history
// and compared across them. Slides are found by their section id in the built IR.
test.describe.configure({ mode: 'default' })
const deck = useFixture('code')
const PAGE = readFileSync(new URL('fixtures/code/code.md', import.meta.url), 'utf8')
const FILE = 'e2e/fixtures/code/cart.ts'

function git(...args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf8' }).trim()
}

/** The first value of a directive option in the page, e.g. `:pin:`. */
function option(name: string): string {
  return new RegExp(`^:${name}: (.+)$`, 'm').exec(PAGE)![1]!
}

/** Slidev keeps neighbouring slides in the DOM; the one shown is found by its heading. */
async function openSlide(page: Page, id: string, heading: string) {
  await page.goto(`${deck().slides}/${deck().slide(id)}`)
  const slide = page.locator('.slidev-page').filter({ has: page.locator('h1', { hasText: heading }) })
  await expect(slide).toBeVisible()
  return slide
}

test('the code block highlights the logical units one step after another', async ({ page }) => {
  // Units of the checkout region: validate, price, receipt.
  const units = [
    ['if (items.length === 0)', 'throw new Error(\'cart is empty\')'],
    ['const subtotal =', 'const discount ='],
    ['return `total:'],
  ]
  const slide = await openSlide(page, 'code-steps', '分步高亮')
  const lines = slide.locator('.slidev-code .line')
  await expect(lines).toHaveCount(7)
  const expectUnit = async (step: number) => {
    const highlighted = lines.and(page.locator('.highlighted'))
    await expect(highlighted).toHaveCount(units[step]!.length)
    for (const [i, text] of units[step]!.entries()) await expect(highlighted.nth(i)).toContainText(text)
  }
  await expectUnit(0)
  for (const step of [1, 2]) {
    await page.keyboard.press('ArrowRight')
    await expectUnit(step)
  }
  await page.keyboard.press('ArrowLeft')
  await expectUnit(1)
})

test('the link points to the remote repository at the pinned commit and line range', async ({ page }) => {
  const commit = git('rev-parse', `${option('pin')}^{commit}`)
  const source = git('show', `${commit}:${FILE}`).split('\n')
  const start = source.indexOf('// #region checkout') + 2
  const end = source.indexOf('// #endregion checkout')

  const ref = (await openSlide(page, 'code-steps', '分步高亮')).locator('.pm-code-origin[data-anchor$="#checkout"]')
  await expect(ref.locator('a.pm-code-origin__file')).toHaveAttribute('href', `${option('repo')}/blob/${commit}/${FILE}#L${start}-L${end}`)
  await expect(ref.locator('.pm-code-origin__commit')).toHaveText(`@ ${commit.slice(0, 7)}`)
  await expect(ref.locator('.pm-code-origin__badge')).toHaveText('已锁定')
})

test('the multi-version code block switches versions with the steps', async ({ page }) => {
  const commits = option('variants').split(',').map(rev => git('rev-parse', `${rev.trim()}^{commit}`))
  const versions = ['for (let i = 0; i < prices.length; i++)', 'for (const price of prices)', 'prices.reduce((sum, price) => sum + price, 0)']

  const slide = await openSlide(page, 'code-variants', '多版本切换')
  const ref = slide.locator('.pm-code-origin[data-anchor$="#total"]')
  const code = slide.locator('.slidev-code')
  const active = ref.locator('.pm-code-origin__variant[data-active]')
  for (const [i, commit] of commits.entries()) {
    await expect(ref.locator('.pm-code-origin__variant').nth(i)).toHaveAttribute('href', new RegExp(`/blob/${commit}/${FILE}#L\\d+-L\\d+$`))
  }

  for (const step of [0, 1, 2]) {
    if (step > 0) await page.keyboard.press('ArrowRight')
    await expect(code).toContainText(versions[step]!)
    await expect(active).toHaveText(commits[step]!.slice(0, 7))
  }
  await page.keyboard.press('ArrowLeft')
  await expect(code).toContainText(versions[1]!)
  await expect(code).not.toContainText(versions[2]!)
  await expect(active).toHaveText(commits[1]!.slice(0, 7))
})

test('the web form links the code to the remote repository at the pinned commit', async ({ page }) => {
  const commit = git('rev-parse', `${option('pin')}^{commit}`)
  await page.goto(`${deck().web}/code.html`)
  const link = page.locator(`a[href^="${option('repo')}/blob/${commit}/${FILE}#L"]`)
  await expect(link.first()).toBeVisible()
  await expect(page.getByText('const discount = coupon').first()).toBeVisible()
  // The same origin bar as in the slides: the pinned commit and whether the code drifted.
  const ref = page.locator('.pm-section[data-section="code-steps"] .pm-code-origin[data-anchor$="#checkout"]')
  await expect(ref.locator('.pm-code-origin__commit')).toHaveText(`@ ${commit.slice(0, 7)}`)
  await expect(ref.locator('.pm-code-origin__badge')).toHaveText('已锁定')
})
