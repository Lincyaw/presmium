import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { useFixture } from './fixtures/deck.ts'

test.describe.configure({ mode: 'default' })
const deck = useFixture('code')
const PAGE = readFileSync(new URL('fixtures/code/code.md', import.meta.url), 'utf8')
const FILE = 'e2e/fixtures/code/cart.ts'

function git(...args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf8' }).trim()
}

function option(name: string): string {
  return new RegExp(`^:${name}: (.+)$`, 'm').exec(PAGE)![1]!
}

function totalLines(commit: string): [number, number] {
  const lines = git('show', `${commit}:${FILE}`).split('\n')
  const start = lines.findIndex(line => line.startsWith('export function total')) + 1
  const end = lines.findIndex((line, i) => i >= start && line === '}') + 1
  return [start, end]
}

const VERSIONS = ['for (let i = 0; i < prices.length; i++)', 'for (const price of prices)', 'prices.reduce((sum, price) => sum + price, 0)']

test('the web form links the code to the remote repository at the pinned commit', async ({ page }) => {
  const commit = git('rev-parse', `${option('pin')}^{commit}`)
  await page.goto(`${deck().web}/code.html`)
  const link = page.locator(`a[href^="${option('repo')}/blob/${commit}/${FILE}#L"]`)
  await expect(link.first()).toBeVisible()
  await expect(page.getByText('const discount = coupon').first()).toBeVisible()
  const ref = page.locator('.pm-section[data-section="code-steps"] .pm-code-origin[data-anchor$="#checkout"]')
  await expect(ref.locator('.pm-code-origin__commit')).toHaveText(`@ ${commit.slice(0, 7)}`)
  await expect(ref.locator('.pm-code-origin__badge')).toHaveText('已锁定')
})

test('the web form\'s present view highlights the units and switches the versions step by step', async ({ page }) => {
  const present = page.getByRole('region', { name: '放映' })
  const highlighted = present.locator('.pm-code .line.highlighted')
  await page.goto(`${deck().web}/code.html?view=present&section=code-steps`)
  await expect(present).toHaveAttribute('data-section', 'code-steps')
  const units = [['if (items.length === 0)', 'throw new Error(\'cart is empty\')'], ['const subtotal =', 'const discount ='], ['return `total:']]
  for (const [step, unit] of units.entries()) {
    if (step > 0) await page.keyboard.press('ArrowRight')
    await expect(present).toHaveAttribute('data-step', String(step))
    await expect(highlighted).toHaveCount(unit.length)
    for (const [i, text] of unit.entries()) await expect(highlighted.nth(i)).toContainText(text)
  }
  await page.keyboard.press('ArrowLeft')
  await expect(highlighted.first()).toContainText(units[1]![0]!)

  const commits = option('variants').split(',').map(rev => git('rev-parse', `${rev.trim()}^{commit}`))
  await page.goto(`${deck().web}/code.html?view=present&section=code-variants`)
  await expect(present).toHaveAttribute('data-section', 'code-variants')
  const active = present.locator('.pm-code-origin__variant[data-active]')
  const expectVersion = async (step: number) => {
    await expect(present).toHaveAttribute('data-step', String(step))
    await expect(present.locator('.pm-code')).toContainText(VERSIONS[step]!)
    await expect(active).toHaveText(commits[step]!.slice(0, 7))
  }
  await expectVersion(0)
  for (const step of [1, 2]) {
    await page.keyboard.press('ArrowRight')
    await expectVersion(step)
  }
  await page.keyboard.press('ArrowLeft')
  await expectVersion(1)
})
