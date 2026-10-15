import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { SLIDES } from './urls.ts'

// The code slides of examples/demo/pages/code.md are addressed by their routeAlias.
const STEPS = `${SLIDES}/code-steps`
const VARIANTS = `${SLIDES}/code-variants`
const PAGE = readFileSync(new URL('../examples/demo/pages/code.md', import.meta.url), 'utf8')
const FILE = 'examples/sample-repo/coderef/cart.ts'

function git(...args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf8' }).trim()
}

function field(name: string): string {
  return new RegExp(`^\\s*${name}: (.+)$`, 'm').exec(PAGE)![1]!
}

test('the code block highlights the logical units one step after another', async ({ page }) => {
  // Units of the checkout region: validate, price, receipt.
  const units = [
    ['if (items.length === 0)', 'throw new Error(\'cart is empty\')'],
    ['const subtotal =', 'const discount ='],
    ['return `total:'],
  ]
  await page.goto(STEPS)
  const lines = page.locator('.pm-coderef[data-anchor$="#checkout"] .line')
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
  const commit = git('rev-parse', `${field('pin')}^{commit}`)
  const source = git('show', `${commit}:${FILE}`).split('\n')
  const start = source.indexOf('// #region checkout') + 2
  const end = source.indexOf('// #endregion checkout')

  await page.goto(STEPS)
  const ref = page.locator('.pm-coderef[data-anchor$="#checkout"]')
  await expect(ref.locator('a.pm-coderef__file')).toHaveAttribute('href', `${field('repo')}/blob/${commit}/${FILE}#L${start}-L${end}`)
  await expect(ref.locator('.pm-coderef__commit')).toHaveText(`@ ${commit.slice(0, 7)}`)
})

test('the multi-version code block switches versions with the steps', async ({ page }) => {
  const commits = field('variants').replace(/[[\]]/g, '').split(',').map(rev => git('rev-parse', `${rev.trim()}^{commit}`))
  const versions = ['for (let i = 0; i < prices.length; i++)', 'for (const price of prices)', 'prices.reduce((sum, price) => sum + price, 0)']

  await page.goto(VARIANTS)
  const ref = page.locator('.pm-coderef[data-anchor$="#total"]')
  const code = ref.locator('.slidev-code')
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
