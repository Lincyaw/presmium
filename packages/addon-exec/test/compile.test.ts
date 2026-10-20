import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { CodeNode, ComponentNode, IRBlock, IRDocument } from '@lincyaw/kernel'
import { presmium } from '@lincyaw/cli/testing'
import { afterAll, expect, it } from 'vitest'

const ADDON = fileURLToPath(new URL('..', import.meta.url))
const CORE = fileURLToPath(new URL('../../addon-core', import.meta.url))
const NOTEBOOK = fileURLToPath(new URL('../../render-notebook', import.meta.url))
const SLIDES = fileURLToPath(new URL('../../render-slides', import.meta.url))

const DECK = `---
plugins:
  - ${ADDON}
renderers:
  notebook:
    package: ${NOTEBOOK}
---

## 面板

\`\`\`{run-panel} python
:params: {n: 3}
for i in range(n):
    print("第", i)
\`\`\`

## 编译时

\`\`\`{code} python
:run:
print(sum(range(5)))
\`\`\`

## IPython

\`\`\`{run-panel} ipython
print("ipython", 2 ** 5)
\`\`\`

\`\`\`{code} ipython
:run:
print("plain", 2 ** 6)
\`\`\`

## 脚本

\`\`\`{code} typescript
:run:
const xs: number[] = [1, 2, 3]
console.log(xs.map(x => x * k))
\`\`\`

\`\`\`{run-panel} javascript
:params: {n: 3}
:run: live
:recorded: 预先录制：6
console.log(n * 2)
\`\`\`

## 稍后输出

\`\`\`{run-panel} javascript
:params: {n: 3}
setTimeout(() => console.log('compiled', n * 2), 30)
console.log('now')
\`\`\`

## 超时

\`\`\`{run-panel} python
:timeout: 500
:recorded: rec-out
while True: pass
\`\`\`
`

interface Cell {
  cell_type: string
  source: string[]
  metadata: { tags?: string[] }
  outputs?: { output_type: string, name: string, text: string[] }[]
}

const dirs: string[] = []
afterAll(() => dirs.forEach(dir => rmSync(dir, { recursive: true, force: true })))

function deck(text: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'presmium-exec-'))
  dirs.push(dir)
  writeFileSync(join(dir, 'lecture.md'), text)
  return dir
}

async function build(dir: string, env: Record<string, string> = {}): Promise<{ code: number, output: string, cells: Cell[] }> {
  const { code, stdout, stderr } = await presmium(dir, ['build', '--to', 'notebook', '--out', 'out'], env)
  const cells = JSON.parse(readFileSync(join(dir, 'out/notebook/lecture.ipynb'), 'utf8')).cells as Cell[]
  return { code, output: stdout + stderr, cells }
}

async function ir(dir: string): Promise<{ doc: IRDocument, blocks(section: string): IRBlock[] }> {
  const { code, stdout, stderr } = await presmium(dir, ['ir'])
  expect(code, stderr).toBe(0)
  const doc = JSON.parse(stdout) as IRDocument
  const flat = (list: IRBlock[]): IRBlock[] => list.flatMap(block => [block, ...flat(block.node.type === 'component' ? block.node.children ?? [] : [])])
  return { doc, blocks: id => flat(doc.sections.find(section => section.id === id)!.blocks) }
}

const code = (cells: Cell[]) => cells.filter(c => c.cell_type === 'code').map(c => ({ source: c.source.join(''), stdout: c.outputs?.map(o => o.text.join('')).join(''), tags: c.metadata.tags }))

const markdown = (cells: Cell[]) => cells.filter(c => c.cell_type === 'markdown').map(c => c.source.join('')).join('\n\n')

it('records the output at compile time; a run panel in the kernel\'s language becomes a code cell with its parameters', async () => {
  const dir = deck(DECK.replace('x * k', 'x * 2'))
  const first = await build(dir)
  expect(first.code, first.output).toBe(0)
  expect(first.output).toContain('code runs: 7 executed, 0 from cache')
  expect(code(first.cells)).toEqual([
    { source: 'n = 3\nfor i in range(n):\n    print("第", i)', stdout: '第 0\n第 1\n第 2\n' },
    { source: 'print(sum(range(5)))', stdout: '10\n' },
    { source: 'print("ipython", 2 ** 5)', stdout: 'ipython 32\n' },
    { source: 'print("plain", 2 ** 6)', stdout: 'plain 64\n' },
    { source: 'while True: pass', stdout: 'rec-out', tags: ['skip-execution'] },
  ])
  expect(markdown(first.cells)).toContain('```typescript\nconst xs: number[] = [1, 2, 3]\nconsole.log(xs.map(x => x * 2))\n```\n\n```text\n[2,4,6]\n```')
  expect(markdown(first.cells)).toContain("```javascript\nconst n = 3\nsetTimeout(() => console.log('compiled', n * 2), 30)\nconsole.log('now')\n```\n\n```text\nnow\ncompiled 6\n```")
  expect(markdown(first.cells)).toContain('```javascript\nconst n = 3\nconsole.log(n * 2)\n```\n\n```text\n预先录制：6\n```')

  const empty = join(dir, 'no-python')
  mkdirSync(empty)
  const cached = await build(dir, { PATH: empty })
  expect(cached.code, cached.output).toBe(0)
  expect(cached.output).toContain('code runs: 0 executed, 6 from cache')
  expect(code(cached.cells)).toEqual(code(first.cells))
})

it('compares the panels with the notebook kernel\'s language, which need not be Python (R-104)', async () => {
  const dir = deck(DECK.replace('x * k', 'x * 2').replace(`    package: ${NOTEBOOK}`, `    package: ${NOTEBOOK}\n    kernel: javascript`))
  const { code: exit, output, cells } = await build(dir)
  expect(exit, output).toBe(0)
  expect(code(cells).map(cell => cell.source)).toEqual([
    'const n = 3\nconsole.log(n * 2)',
    "const n = 3\nsetTimeout(() => console.log('compiled', n * 2), 30)\nconsole.log('now')",
  ])
  expect(markdown(cells)).toContain('```python\nn = 3\nfor i in range(n):\n    print("第", i)\n```\n\n```text\n第 0\n第 1\n第 2\n```')
  expect(markdown(cells)).toContain('```ipython\nprint("ipython", 2 ** 5)\n```')
})

it('reports where a TypeScript run fails, at the line of the source', async () => {
  const { code: exit, output, cells } = await build(deck(DECK))
  expect(exit, output).toBe(0)
  expect(markdown(cells)).toContain('```text\nReferenceError: k is not defined (line 2)\n```')
})

it('gives a run panel an IR fallback with its recorded output, for static renderers (contract c)', async () => {
  const { blocks } = await ir(deck(DECK.replace('x * k', 'x * 2')))
  const live = blocks('脚本').map(block => block.node).find((node): node is ComponentNode => node.type === 'component' && node.props.recorded === '预先录制：6')
  expect(live, 'the live-only run panel').toBeDefined()
  const fallback = JSON.stringify(live!.fallback)
  expect(fallback).toContain('console.log(n * 2)')
  expect(fallback).toContain('预先录制：6')
})

const RUNS = `---
plugins:
  - ${ADDON}
presmium:
  presmium.exec: { timeoutMs: 20000 }
---

(slow)=
## 一个慢的例子

:::{config}
presmium.exec: { timeoutMs: 1000 }
:::

\`\`\`{run-panel} python
import time
time.sleep(3)
\`\`\`

\`\`\`{code} python
:run:
import time
time.sleep(3)
\`\`\`

(params)=
## 参数

\`\`\`{run-panel} python
:params: {n: 3, word: hi}
print(word, n * 2)
\`\`\`

(streams)=
## 输出

\`\`\`{code} javascript
:run:
process.stdout.write('raw ')
console.dir({ a: 1 })
console.log('done')
\`\`\`

\`\`\`{code} javascript
:run:
new Promise((_, reject) => setTimeout(() => reject(new Error('late')), 20))
console.log('started')
\`\`\`
`

it('stops compile-time runs at presmium.exec.timeoutMs of their section (R-26)', async () => {
  const { blocks } = await ir(deck(RUNS))
  const [panel, child, plain] = blocks('slow').map(block => block.node) as [ComponentNode, CodeNode, CodeNode]
  expect(panel.props.timeout).toBe(1000)
  for (const node of [child, plain]) {
    expect(node.run?.timeoutMs).toBe(1000)
    expect(node.outputs?.[0]).toMatchObject({ ok: false, timedOut: true })
  }
  const [other] = blocks('params').map(block => block.node) as [ComponentNode]
  expect(other.props.timeout).toBe(20000)
})

it('puts the parameters and the compile-time output in a run panel\'s fallback (R-106)', async () => {
  const { blocks } = await ir(deck(RUNS))
  const [panel] = blocks('params').map(block => block.node) as [ComponentNode]
  expect(panel.fallback).toEqual({ type: 'root', children: [
    { type: 'code', lang: 'python', value: 'n = 3\nword = "hi"\nprint(word, n * 2)' },
    { type: 'code', lang: 'text', value: 'hi 6' },
  ] })
})

it('records what code writes to its streams, and fails a run whose promise rejects later (R-105)', async () => {
  const { blocks } = await ir(deck(RUNS))
  const [streams, rejected] = blocks('streams').map(block => block.node) as [CodeNode, CodeNode]
  expect(streams.outputs?.[0]).toMatchObject({ ok: true, exitCode: 0, stdout: 'raw {"a":1}\ndone\n', stderr: '' })
  expect(rejected.outputs?.[0]).toMatchObject({ ok: false, exitCode: 1, stdout: 'started\n' })
  expect(rejected.outputs?.[0]?.stderr).toContain('Error: late')
})

it('builds the slides of a run panel in any language, without recorded output in the panel (R-29)', async () => {
  const dir = deck(`---
plugins:
  - ${CORE}
  - ${ADDON}
renderers:
  slides:
    package: ${SLIDES}
    theme: none
---

## 一种语言

\`\`\`{run-panel} mylang
say hello
\`\`\`

## Python

\`\`\`{run-panel} python
print(6 * 7)
\`\`\`
`)
  const { code: exit, stdout, stderr } = await presmium(dir, ['build', '--to', 'slides', '--out', 'out'])
  expect(exit, stdout + stderr).toBe(0)
  const slides = readFileSync(join(dir, '.presmium/slides/slides.md'), 'utf8')
  expect(slides).toContain('<PmRunPanel lang="mylang" code="say hello"')
  expect(slides).toContain('<PmRunPanel lang="python" code="print(6 * 7)"')
  expect(slides).not.toContain('pm-output')
}, 120_000)
