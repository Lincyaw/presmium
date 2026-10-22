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

async function openSlide(page: Page, id: string, heading: string) {
  await page.goto(`${deck().slides}/${deck().slide(id)}`)
  const slide = page.locator('.slidev-page').filter({ has: page.locator('h1', { hasText: heading }) })
  await expect(slide).toBeVisible()
  return slide
}

test('the code block highlights the logical units one step after another', async ({ page }) => {
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

test('the multi-version code block switches versions with the steps, the file link with them', async ({ page }) => {
  const commits = option('variants').split(',').map(rev => git('rev-parse', `${rev.trim()}^{commit}`))

  const slide = await openSlide(page, 'code-variants', '多版本切换')
  const ref = slide.locator('.pm-code-origin[data-anchor$="#total"]')
  const code = slide.locator('.slidev-code')
  const active = ref.locator('.pm-code-origin__variant[data-active]')
  const file = ref.locator('a.pm-code-origin__file').filter({ visible: true })
  const expectVersion = async (k: number) => {
    const [start, end] = totalLines(commits[k]!)
    await expect(code).toContainText(VERSIONS[k]!)
    await expect(active).toHaveText(commits[k]!.slice(0, 7))
    await expect(file).toHaveText(`${FILE}:${start}-${end}`)
    await expect(file).toHaveAttribute('href', `${option('repo')}/blob/${commits[k]}/${FILE}#L${start}-L${end}`)
  }
  for (const [i, commit] of commits.entries()) {
    await expect(ref.locator('.pm-code-origin__variant').nth(i)).toHaveAttribute('href', new RegExp(`/blob/${commit}/${FILE}#L\\d+-L\\d+$`))
  }

  for (const step of [0, 1, 2]) {
    if (step > 0) await page.keyboard.press('ArrowRight')
    await expectVersion(step)
  }
  await page.keyboard.press('ArrowLeft')
  await expectVersion(1)
  await expect(code).not.toContainText(VERSIONS[2]!)
})

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
