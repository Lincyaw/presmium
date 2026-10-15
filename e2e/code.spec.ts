import { execFileSync, spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
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

// K-09: `slidev dev` on a throwaway repository, whose code changes while the slides are open.
test.describe('dev server', () => {
  const root = (path: string) => fileURLToPath(new URL(`../${path}`, import.meta.url))
  const CART = `// #region checkout
export function checkout(prices: number[]): string {
  return \`total: \${prices.length}\`
}
// #endregion checkout
`
  let repo: string
  let url: string
  let server: ChildProcess | undefined
  const git = (...args: string[]) => execFileSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@example.com', ...args], { cwd: repo, encoding: 'utf8' }).trim()

  test.beforeAll(async () => {
    repo = mkdtempSync(join(tmpdir(), 'presmium-code-dev-'))
    mkdirSync(join(repo, 'src'))
    mkdirSync(join(repo, 'deck'))
    writeFileSync(join(repo, 'src/cart.ts'), CART)
    git('init', '-q', '-b', 'main')
    git('add', '.')
    git('commit', '-qm', 'cart')
    // Permalinks come from the origin remote; the deck does not configure presmium.code.repo.
    git('remote', 'add', 'origin', 'git@github.com:acme/shop.git')
    writeFileSync(join(repo, 'deck/slides.md'), `---
theme: ${root('examples/demo/node_modules/@slidev/theme-default')}
addons:
  - ${root('packages/addon-core')}
  - ${root('packages/addon-code')}
---

# Pinned and live

\`\`\`coderef
anchor: region:src/cart.ts#checkout
pin: ${git('rev-parse', '--short', 'HEAD')}
\`\`\`

\`\`\`coderef
anchor: symbol:src/cart.ts#checkout
\`\`\`

---

# Broken

\`\`\`coderef
anchor: region:src/cart.ts#missing
\`\`\`
`)
    const port = await new Promise<number>((resolve) => {
      const probe = createServer().listen(0, () => {
        const { port } = probe.address() as { port: number }
        probe.close(() => resolve(port))
      })
    })
    url = `http://localhost:${port}`
    server = spawn(process.execPath, [root('examples/demo/node_modules/@slidev/cli/bin/slidev.mjs'), 'slides.md', '--port', String(port)], { cwd: join(repo, 'deck'), stdio: 'ignore' })
    await expect.poll(() => fetch(url).then(res => res.ok, () => false), { timeout: 60_000 }).toBe(true)
  })

  test.afterAll(() => {
    server?.kill()
    rmSync(repo, { recursive: true, force: true })
  })

  test('code references follow the referenced file and git history without a restart', async ({ page }) => {
    test.setTimeout(240_000)
    const pinned = page.locator('.pm-coderef[data-anchor="region:src/cart.ts#checkout"]:visible')
    const live = page.locator('.pm-coderef[data-anchor="symbol:src/cart.ts#checkout"]:visible')
    // The first visit to a fresh deck may race Vite's dependency optimization; reload until the slide renders.
    await expect(async () => {
      await page.goto(`${url}/1`)
      await expect(live).toBeVisible({ timeout: 30_000 })
    }).toPass({ timeout: 180_000 })
    await expect(live.locator('a.pm-coderef__file')).toHaveAttribute('href', `https://github.com/acme/shop/blob/${git('rev-parse', 'HEAD')}/src/cart.ts#L2-L4`)
    await expect(pinned.locator('.pm-coderef__badge')).toHaveText('已锁定')

    // Give the dev server a moment to start watching the referenced file, then change it.
    await page.waitForTimeout(1000)
    writeFileSync(join(repo, 'src/cart.ts'), CART.replace('prices.length', 'prices.length * 2'))
    await expect(live.locator('.slidev-code')).toContainText('prices.length * 2', { timeout: 15_000 })
    await expect(pinned.locator('.slidev-code')).not.toContainText('prices.length * 2')
    await expect(pinned.locator('.pm-coderef__badge')).toHaveText('已漂移')

    // A commit moves HEAD, which the permalink of unpinned code follows.
    git('commit', '-qam', 'double')
    await expect(live.locator('a.pm-coderef__file')).toHaveAttribute('href', new RegExp(`/blob/${git('rev-parse', 'HEAD')}/`), { timeout: 15_000 })

    await page.goto(`${url}/2`)
    await expect(page.locator('.pm-coderef--error:visible')).toContainText('region "missing" not found in src/cart.ts')
  })
})
