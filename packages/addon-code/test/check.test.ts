// Runs the real `presmium check` CLI on a MyST deck that references code in a throwaway git
// repository; the diagnostics come from the {code-ref} resolution pass of the compiler.
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

// The same code with blank lines inserted, indented four spaces per level, and the checkout region shifted right.
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

// Python code without markers, referenced by symbol.
const PARSER = `class Parser:
    def __init__(self, text):
        self.text = text

    def parse(self):
        words = []
        for word in self.text.split():
            if word:
                words.append(word.lower())
        return words
`

// The same code with blank lines inserted and indented two spaces per level.
const PARSER_REFORMATTED = `\n\n${PARSER.replace(/^(?: {4})+/gm, lead => ' '.repeat(lead.length / 2))}`

// A fragment without markers or a name, found by its syntax: the guard of checkout.
const GUARD = 'pattern:src/cart.ts#if ($COND) throw $ERR'

const repos: string[] = []
afterAll(() => repos.forEach(dir => rmSync(dir, { recursive: true, force: true })))

interface Finding {
  checkId: string
  severity: string
  message: string
  hint?: string
  source: { file: string, line: number }
}

/** A git repository with src/cart.ts and src/parser.py committed and a deck that pins one anchor to that commit. */
function createRepo(): { dir: string, deck: string, fenceLine: number, edit: (text: string, file?: string) => void } {
  const dir = mkdtempSync(join(tmpdir(), 'presmium-code-'))
  repos.push(dir)
  const git = (...args: string[]) => execFileSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@example.com', ...args], { cwd: dir, encoding: 'utf8' }).trim()
  const edit = (text: string, file = 'src/cart.ts') => writeFileSync(join(dir, file), text)
  mkdirSync(join(dir, 'src'))
  mkdirSync(join(dir, 'deck'))
  edit(CART)
  edit(PARSER, 'src/parser.py')
  git('init', '-q')
  git('add', '.')
  git('commit', '-qm', 'cart')
  const deck = `---
plugins:
  - ${ADDON}
presmium:
  presmium.code:
    repo: https://github.com/acme/shop
---

## Pinned

\`\`\`{code-ref} region:src/cart.ts#checkout
:pin: ${git('rev-parse', '--short', 'HEAD')}
:steps: validate, price
\`\`\`

## Live

\`\`\`{code-ref} symbol:src/cart.ts#total
\`\`\`

## Python

\`\`\`{code-ref} symbol:src/parser.py#Parser.parse
\`\`\`

## Pattern

\`\`\`{code-ref} ${GUARD}
\`\`\`
`
  writeFileSync(join(dir, 'deck/lecture.md'), deck)
  return { dir, deck: join(dir, 'deck/lecture.md'), fenceLine: deck.split('\n').indexOf('```{code-ref} region:src/cart.ts#checkout') + 1, edit }
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
  repo.edit(PARSER_REFORMATTED, 'src/parser.py')
  const { code, findings } = await check(repo.dir)
  expect(code).toBe(0)
  expect(problems(findings)).toEqual([])
  // The lock notices that the anchors moved down, and nothing else: the code itself is unchanged.
  expect(findings.map(f => f.message)).toEqual([
    'anchor region:src/cart.ts#checkout moved to src/cart.ts:8',
    'anchor symbol:src/cart.ts#total moved to src/cart.ts:3',
    'anchor symbol:src/parser.py#Parser.parse moved to src/parser.py:7',
    `anchor ${GUARD} moved to src/cart.ts:10`,
  ])
})

it('asks to confirm a renamed region or method and reports a deleted anchor as an error at its block', async () => {
  const repo = createRepo()
  await check(repo.dir, '--update-lock')

  repo.edit(CART.replaceAll('region checkout', 'region pay'))
  repo.edit(PARSER.replace('def parse(', 'def parse_all('), 'src/parser.py')
  const renamed = await check(repo.dir)
  expect(renamed.code).toBe(0)
  expect(problems(renamed.findings)).toMatchObject([
    { checkId: 'presmium.code.anchors', severity: 'warning', message: expect.stringContaining('candidates: src/cart.ts:6') },
    { checkId: 'presmium.code.anchors', severity: 'warning', message: expect.stringContaining('candidates: src/parser.py:5') },
  ])
  repo.edit(PARSER, 'src/parser.py')

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

interface CodeNode { value: string, origin: { anchor: string, file: string, startLine: number, endLine: number, pin?: string, permalink?: string } }

/** The code nodes of the deck at `deck` (relative to `dir`), compiled by `presmium ir`. */
function codeNodes(dir: string, deck = 'deck'): Promise<CodeNode[]> {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [BIN, 'ir', deck], { cwd: dir }, (error, stdout, stderr) => {
      if (error) return reject(new Error(`presmium ir failed: ${stderr}`))
      const doc = JSON.parse(stdout) as { sections: { blocks: { node: { type: string } }[] }[] }
      resolve(doc.sections.flatMap(s => s.blocks.map(b => b.node)).filter(node => node.type === 'code') as unknown as CodeNode[])
    })
  })
}

it('finds a fragment by its syntax with an ast-grep pattern, and reports it lost once nothing matches (P-11)', async () => {
  const repo = createRepo()
  const guard = (await codeNodes(repo.dir)).find(node => node.origin.anchor === GUARD)
  expect(guard?.value).toBe('if (prices.length === 0)\n  throw new Error(\'empty\')')
  expect(guard?.origin).toMatchObject({ file: 'src/cart.ts', startLine: 8, endLine: 9 })

  repo.edit(CART.replace('throw new Error(\'empty\')', 'return \'empty\''))
  const { code, findings } = await check(repo.dir)
  expect(code).toBe(1)
  expect(findings.filter(f => f.severity === 'error')).toMatchObject([{
    checkId: 'presmium.code.anchors',
    message: `anchor ${GUARD} is lost: pattern "if ($COND) throw $ERR" matches nothing in src/cart.ts`,
  }])
})

it('reads pinned code from a git submodule and links it to the submodule\'s repository (P-12)', async () => {
  const repo = createRepo()
  const lib = mkdtempSync(join(tmpdir(), 'presmium-lib-'))
  repos.push(lib)
  const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@example.com', '-c', 'protocol.file.allow=always', ...args], { cwd, encoding: 'utf8' }).trim()
  mkdirSync(join(lib, 'src'))
  writeFileSync(join(lib, 'src/x.ts'), '// lib\n// #region part\nexport function part(a: number): number {\n  return a * 2\n}\n// #endregion part\n')
  git(lib, 'init', '-q')
  git(lib, 'add', '.')
  git(lib, 'commit', '-qm', 'lib')
  const pinned = git(lib, 'rev-parse', 'HEAD')
  // The submodule's code changes after the pinned commit.
  writeFileSync(join(lib, 'src/x.ts'), '// lib\n// #region part\nexport function part(a: number): number {\n  return a * 3\n}\n// #endregion part\n')
  git(lib, 'commit', '-qam', 'triple')

  git(repo.dir, 'submodule', 'add', '-q', lib, 'vendor/lib')
  git(repo.dir, 'commit', '-qm', 'lib as a submodule')
  git(join(repo.dir, 'vendor/lib'), 'remote', 'set-url', 'origin', 'git@github.com:acme/lib.git')
  mkdirSync(join(repo.dir, 'sub'))
  writeFileSync(join(repo.dir, 'sub/lecture.md'), `---
plugins:
  - ${ADDON}
presmium:
  presmium.code:
    repo: https://github.com/acme/shop
---

## Library

\`\`\`{code-ref} region:vendor/lib/src/x.ts#part
:pin: ${pinned.slice(0, 7)}
\`\`\`
`)
  const [part] = await codeNodes(repo.dir, 'sub')
  expect(part?.value).toBe('export function part(a: number): number {\n  return a * 2\n}')
  expect(part?.origin).toMatchObject({ file: 'vendor/lib/src/x.ts', pin: pinned, permalink: `https://github.com/acme/lib/blob/${pinned}/src/x.ts#L3-L5` })
})
