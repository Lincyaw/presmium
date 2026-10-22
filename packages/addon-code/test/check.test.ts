import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { presmium } from '@lincyaw/cli/testing'
import { Compiler } from '@lincyaw/compiler'
import { docBlocks } from '@lincyaw/kernel'
import type { CodeNode as IRCodeNode, IRDocument } from '@lincyaw/kernel'
import { afterAll, expect, it } from 'vitest'

const ADDON = fileURLToPath(new URL('..', import.meta.url))
const EXEC = fileURLToPath(new URL('../../addon-exec', import.meta.url))

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

const PARSER_REFORMATTED = `\n\n${PARSER.replace(/^(?: {4})+/gm, lead => ' '.repeat(lead.length / 2))}`

const GUARD = 'pattern:src/cart.ts#if ($COND) throw $ERR'

function sh(cwd: string, command: string, args: string[]): string {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed: ${result.stderr}`)
  return result.stdout.trim()
}

const repos: string[] = []
afterAll(() => repos.forEach(dir => rmSync(dir, { recursive: true, force: true })))

interface Finding {
  checkId: string
  severity: string
  message: string
  hint?: string
  source: { file: string, line: number }
}

function createRepo(): { dir: string, deck: string, fenceLine: number, edit: (text: string, file?: string) => void } {
  const dir = mkdtempSync(join(tmpdir(), 'presmium-code-'))
  repos.push(dir)
  const git = (...args: string[]) => sh(dir, 'git', ['-c', 'user.name=test', '-c', 'user.email=test@example.com', ...args])
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

async function check(dir: string, ...args: string[]): Promise<{ code: number, findings: Finding[] }> {
  const { code, stdout, stderr } = await presmium(dir, ['check', 'deck', '--json', ...args])
  try {
    return { code, findings: JSON.parse(stdout).findings }
  }
  catch {
    throw new Error(`presmium check failed: ${stderr}`)
  }
}

const problems = (findings: Finding[]) => findings.filter(f => f.severity !== 'info')

it('renders local code without a remote or permalink silently, while retaining meaningful anchor information', async () => {
  const repo = createRepo()
  writeFileSync(repo.deck, `---\nplugins:\n  - ${ADDON}\n---\n\n## Local\n\n\`\`\`{code-ref} region:src/cart.ts#checkout\n\`\`\`\n`)
  const result = await presmium(repo.dir, ['ir', 'deck'])
  expect(result.code, result.stdout + result.stderr).toBe(0)
  const doc = JSON.parse(result.stdout) as IRDocument
  expect(doc.diagnostics).toEqual([])
  const code = [...docBlocks(doc)].find(({ block }) => block.node.type === 'code')!.block.node as IRCodeNode
  expect(code.value).toContain('export function checkout(prices: number[], coupon?: string): string')
  expect(code.origin?.permalink).toBeUndefined()

  expect((await check(repo.dir, '--update-lock')).findings).toEqual([])
  repo.edit(CART_REFORMATTED)
  const moved = await check(repo.dir)
  expect(moved.code).toBe(0)
  expect(moved.findings).toEqual([expect.objectContaining({ checkId: 'presmium.code.anchors', severity: 'info', message: 'anchor region:src/cart.ts#checkout moved to src/cart.ts:8' })])
})

it('still reports execution failures and missing source when a local code reference has no remote', async () => {
  const repo = createRepo()
  repo.edit('# region failure\nraise ValueError("query needs a key")\n# endregion failure\n', 'src/parser.py')
  writeFileSync(repo.deck, `---\nplugins:\n  - ${ADDON}\n  - ${EXEC}\n---\n\n## Query\n\n\`\`\`{code-ref} region:src/parser.py#failure\n:run:\n\`\`\`\n`)
  const result = await presmium(repo.dir, ['ir', 'deck'])
  expect(result.code, result.stdout + result.stderr).toBe(0)
  const doc = JSON.parse(result.stdout) as IRDocument
  expect(doc.diagnostics).toEqual([expect.objectContaining({ checkId: 'presmium.execute', severity: 'warning', message: 'block code-1 exited with code 1' })])
  const code = [...docBlocks(doc)].find(({ block }) => block.node.type === 'code')!.block.node as IRCodeNode
  expect(code.outputs?.[0]?.stderr).toContain('ValueError: query needs a key')

  rmSync(join(repo.dir, 'src/parser.py'))
  const missing = await check(repo.dir)
  expect(missing.code).toBe(1)
  expect(missing.findings).toContainEqual(expect.objectContaining({ checkId: 'presmium.code.anchors', severity: 'error', message: expect.stringContaining('src/parser.py not found under the repository root') }))
  expect(missing.findings.some(finding => finding.checkId === 'presmium.code.links')).toBe(false)
})

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

async function codeNodes(dir: string, deck = 'deck'): Promise<CodeNode[]> {
  const { code, stdout, stderr } = await presmium(dir, ['ir', deck])
  if (code !== 0) throw new Error(`presmium ir failed: ${stderr}`)
  const doc = JSON.parse(stdout) as { sections: { blocks: { node: { type: string } }[] }[] }
  return doc.sections.flatMap(s => s.blocks.map(b => b.node)).filter(node => node.type === 'code') as unknown as CodeNode[]
}

it('finds a fragment by its syntax with an ast-grep pattern, and reports it lost once nothing matches', async () => {
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

it('reads pinned code from a git submodule and links it to the submodule\'s repository', async () => {
  const repo = createRepo()
  const lib = mkdtempSync(join(tmpdir(), 'presmium-lib-'))
  repos.push(lib)
  const git = (cwd: string, ...args: string[]) => sh(cwd, 'git', ['-c', 'user.name=test', '-c', 'user.email=test@example.com', '-c', 'protocol.file.allow=always', ...args])
  mkdirSync(join(lib, 'src'))
  writeFileSync(join(lib, 'src/x.ts'), '// lib\n// #region part\nexport function part(a: number): number {\n  return a * 2\n}\n// #endregion part\n')
  git(lib, 'init', '-q')
  git(lib, 'add', '.')
  git(lib, 'commit', '-qm', 'lib')
  const pinned = git(lib, 'rev-parse', 'HEAD')
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

it('reads anchor paths from the repository root and says so when a path is written from the deck', async () => {
  const repo = createRepo()
  mkdirSync(join(repo.dir, 'deck/lib'))
  writeFileSync(join(repo.dir, 'deck/lib/util.ts'), '// #region one\nexport const one = 1\n// #endregion one\n')
  writeFileSync(repo.deck, `${readFileSync(repo.deck, 'utf8')}
## Relative

\`\`\`{code-ref} region:lib/util.ts#one
\`\`\`
`)
  const { code, findings } = await check(repo.dir)
  expect(code).toBe(1)
  expect(findings.filter(f => f.severity === 'error')).toEqual([expect.objectContaining({
    checkId: 'presmium.code.anchors',
    message: 'anchor region:lib/util.ts#one is lost: lib/util.ts not found under the repository root (..); anchor paths are relative to the repository root',
    hint: 'lib/util.ts is a file of the deck\'s directory; from the repository root it is deck/lib/util.ts: write region:deck/lib/util.ts#one',
  })])
})

it('links a section\'s code to the repository its {config} names', async () => {
  const repo = createRepo()
  writeFileSync(repo.deck, `${readFileSync(repo.deck, 'utf8')}
## Elsewhere

:::{config}
presmium.code: { repo: https://github.com/acme/elsewhere }
:::

\`\`\`{code-ref} symbol:src/cart.ts#total
:pin: HEAD
\`\`\`
`)
  const nodes = await codeNodes(repo.dir)
  const links = nodes.filter(node => node.origin.anchor === 'symbol:src/cart.ts#total').map(node => node.origin.permalink)
  expect(links).toEqual([
    expect.stringMatching(/^https:\/\/github\.com\/acme\/shop\/blob\/[0-9a-f]{40}\/src\/cart\.ts#L1-L3$/),
    expect.stringMatching(/^https:\/\/github\.com\/acme\/elsewhere\/blob\/[0-9a-f]{40}\/src\/cart\.ts#L1-L3$/),
  ])
})

it('refuses an anchor that names a file in .git, putting nothing of it in the IR, and reads the working tree\'s own files', async () => {
  const repo = createRepo()
  sh(repo.dir, 'git', ['remote', 'add', 'origin', 'https://probe-user:ghp_PROBESECRET0123456789@github.com/acme/shop.git'])
  writeFileSync(repo.deck, `---\nplugins:\n  - ${ADDON}\n---\n\n## Named\n\n\`\`\`{code-ref} region:.git/config#core\n\`\`\`\n`)
  const compilation = await new Compiler(repo.deck, { workspaceRoot: repo.dir }).compile()
  expect(JSON.stringify(compilation.doc)).not.toContain('PROBESECRET')
  const errors = compilation.doc.diagnostics.filter(d => d.checkId === 'presmium.code.anchors' && d.severity === 'error').map(d => d.message)
  expect(errors).toEqual(['anchor region:.git/config#core names a file in .git, which holds git\'s data, not code'])
  writeFileSync(repo.deck, `---\nplugins:\n  - ${ADDON}\n---\n\n## Live\n\n\`\`\`{code-ref} symbol:src/cart.ts#total\n\`\`\`\n`)
  const local = await new Compiler(repo.deck, { workspaceRoot: repo.dir }).compile()
  const code = [...docBlocks(local.doc)].map(({ block }) => block.node).find(node => node.type === 'code')
  expect(code && 'value' in code ? code.value : '').toContain('prices.reduce')
})
