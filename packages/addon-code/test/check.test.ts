// Runs the real `presmium check` CLI on a deck that references code in a throwaway git repository.
import { execFile, execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, expect, it } from 'vitest'

const BIN = fileURLToPath(new URL('../../cli/bin/presmium.mjs', import.meta.url))
const ADDON = fileURLToPath(new URL('..', import.meta.url))

const CART = `export function total(prices: number[]): number {
  return prices.reduce((sum, price) => sum + price, 0)
}

// #region checkout
export function checkout(prices: number[], coupon?: string): string {
  // #region validate
  if (prices.length === 0)
    throw new Error('empty')
  // #endregion validate
  // #region price
  const discount = coupon ? 0.1 : 0
  // #endregion price
  return \`total: \${total(prices) * (1 - discount)}\`
}
// #endregion checkout
`

// The same code with blank lines inserted and the checkout region re-indented as a whole.
const CART_REFORMATTED = `

export function total(prices: number[]): number {
  return prices.reduce((sum, price) => sum + price, 0)
}

  // #region checkout
  export function checkout(prices: number[], coupon?: string): string {
    // #region validate
    if (prices.length === 0)
      throw new Error('empty')
    // #endregion validate

    // #region price
    const discount = coupon ? 0.1 : 0
    // #endregion price

    return \`total: \${total(prices) * (1 - discount)}\`
  }
  // #endregion checkout
`

const repos: string[] = []
afterAll(() => repos.forEach(dir => rmSync(dir, { recursive: true, force: true })))

interface Finding {
  checkId: string
  severity: string
  message: string
  hint?: string
  source: { file: string, line: number }
}

/** A git repository with src/cart.ts committed and a deck that pins one anchor to that commit. */
function createRepo(): { dir: string, deck: string, fenceLine: number, edit: (text: string) => void } {
  const dir = mkdtempSync(join(tmpdir(), 'presmium-code-'))
  repos.push(dir)
  const git = (...args: string[]) => execFileSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@example.com', ...args], { cwd: dir, encoding: 'utf8' }).trim()
  const edit = (text: string) => writeFileSync(join(dir, 'src/cart.ts'), text)
  mkdirSync(join(dir, 'src'))
  mkdirSync(join(dir, 'deck'))
  edit(CART)
  git('init', '-q')
  git('add', '.')
  git('commit', '-qm', 'cart')
  const deck = `---
addons:
  - ${ADDON}
presmium:
  presmium.code:
    repo: https://github.com/acme/shop
---

# Pinned

\`\`\`coderef
anchor: region:src/cart.ts#checkout
pin: ${git('rev-parse', '--short', 'HEAD')}
steps: [validate, price]
\`\`\`

---

# Live

\`\`\`coderef
anchor: symbol:src/cart.ts#total
\`\`\`
`
  writeFileSync(join(dir, 'deck/slides.md'), deck)
  return { dir, deck: join(dir, 'deck/slides.md'), fenceLine: deck.split('\n').indexOf('```coderef') + 1, edit }
}

function check(dir: string, ...args: string[]): Promise<{ code: number, findings: Finding[] }> {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [BIN, 'check', 'deck', '--json', ...args], { cwd: dir }, (error, stdout, stderr) => {
      try {
        resolve({ code: error ? Number(error.code) : 0, findings: JSON.parse(stdout).findings })
      }
      catch {
        reject(new Error(`presmium check failed: ${stderr}`))
      }
    })
  })
}

const problems = (findings: Finding[]) => findings.filter(f => f.severity !== 'info')

it('keeps passing after blank lines are inserted and the referenced code is re-indented', async () => {
  const repo = createRepo()
  const locked = await check(repo.dir, '--update-lock')
  expect(locked.code).toBe(0)
  expect(locked.findings).toEqual([])

  repo.edit(CART_REFORMATTED)
  const { code, findings } = await check(repo.dir)
  expect(code).toBe(0)
  expect(problems(findings)).toEqual([])
  // The lock notices that both anchors moved down.
  expect(findings.map(f => f.message)).toEqual([
    'anchor region:src/cart.ts#checkout moved to src/cart.ts:8',
    'anchor symbol:src/cart.ts#total moved to src/cart.ts:3',
  ])
})

it('asks to confirm a renamed region and reports a deleted anchor as an error at its block', async () => {
  const repo = createRepo()
  await check(repo.dir, '--update-lock')

  repo.edit(CART.replaceAll('region checkout', 'region pay'))
  const renamed = await check(repo.dir)
  expect(renamed.code).toBe(0)
  expect(problems(renamed.findings)).toMatchObject([
    { checkId: 'presmium.code.anchors', severity: 'warning', message: expect.stringContaining('candidates: src/cart.ts:6') },
  ])

  repo.edit(CART.split('\n').filter(line => !line.includes('region checkout')).join('\n'))
  const deleted = await check(repo.dir)
  expect(deleted.code).toBe(1)
  expect(problems(deleted.findings)).toEqual([{
    checkId: 'presmium.code.anchors',
    severity: 'error',
    message: 'anchor region:src/cart.ts#checkout is lost: region "checkout" not found in src/cart.ts',
    hint: expect.any(String),
    source: { file: repo.deck, line: repo.fenceLine },
  }])
})

it('reports drift with a diff when the pinned code changes in the working tree', async () => {
  const repo = createRepo()
  repo.edit(CART.replace('coupon ? 0.1 : 0', 'coupon ? 0.2 : 0'))
  const { code, findings } = await check(repo.dir)
  expect(code).toBe(0)
  const [drift, ...rest] = problems(findings)
  expect(rest).toEqual([])
  expect(drift).toMatchObject({ checkId: 'presmium.code.drift', severity: 'warning', source: { file: repo.deck, line: repo.fenceLine } })
  expect(drift!.message).toMatch(/^code at region:src\/cart\.ts#checkout drifted since pinned commit [0-9a-f]{7}/)
  expect(drift!.hint).toContain('-  const discount = coupon ? 0.1 : 0\n+  const discount = coupon ? 0.2 : 0')
})
