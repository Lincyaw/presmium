import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { SLIDES, WEB } from './urls.ts'

// examples/demo/pages/code.md, built by `presmium build`. Slides are found by
// their section id in the built IR, so sections added before them do not matter.
const DIST = new URL('../examples/demo/dist/', import.meta.url)
const PAGE = readFileSync(new URL('../examples/demo/pages/code.md', import.meta.url), 'utf8')
const FILE = 'examples/sample-repo/coderef/cart.ts'
const HAS_WEB = existsSync(new URL('web', DIST))

function slideOf(id: string): number {
  const ir = JSON.parse(readFileSync(new URL('ir.json', DIST), 'utf8')) as { sections: { id: string, index: number }[] }
  return ir.sections.find(section => section.id === id)!.index
}

function git(...args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf8' }).trim()
}

/** The first value of a directive option in the page, e.g. `:pin:`. */
function option(name: string): string {
  return new RegExp(`^:${name}: (.+)$`, 'm').exec(PAGE)![1]!
}

/** Slidev keeps neighbouring slides in the DOM; the one shown is found by its heading. */
async function openSlide(page: Page, id: string, heading: string) {
  await page.goto(`${SLIDES}/${slideOf(id)}`)
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

  const ref = (await openSlide(page, 'code-steps', '分步高亮')).locator('.pm-coderef[data-anchor$="#checkout"]')
  await expect(ref.locator('a.pm-coderef__file')).toHaveAttribute('href', `${option('repo')}/blob/${commit}/${FILE}#L${start}-L${end}`)
  await expect(ref.locator('.pm-coderef__commit')).toHaveText(`@ ${commit.slice(0, 7)}`)
  await expect(ref.locator('.pm-coderef__badge')).toHaveText('已锁定')
})

test('the multi-version code block switches versions with the steps', async ({ page }) => {
  const commits = option('variants').split(',').map(rev => git('rev-parse', `${rev.trim()}^{commit}`))
  const versions = ['for (let i = 0; i < prices.length; i++)', 'for (const price of prices)', 'prices.reduce((sum, price) => sum + price, 0)']

  const slide = await openSlide(page, 'code-variants', '多版本切换')
  const ref = slide.locator('.pm-coderef[data-anchor$="#total"]')
  const code = slide.locator('.slidev-code')
  const active = ref.locator('.pm-coderef__variant[data-active]')
  for (const [i, commit] of commits.entries()) {
    await expect(ref.locator('.pm-coderef__variant').nth(i)).toHaveAttribute('href', new RegExp(`/blob/${commit}/${FILE}#L\\d+-L\\d+$`))
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
  test.skip(!HAS_WEB, 'needs the web build (examples/demo/dist/web)')
  const commit = git('rev-parse', `${option('pin')}^{commit}`)
  await page.goto(`${WEB}/code.html`)
  const link = page.locator(`a[href^="${option('repo')}/blob/${commit}/${FILE}#L"]`)
  await expect(link.first()).toBeVisible()
  await expect(page.getByText('const discount = coupon').first()).toBeVisible()
})
