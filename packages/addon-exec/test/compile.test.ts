// Runs the real `presmium build --to notebook` on a deck outside git: code runs at compile time
// with the local python3 and node executors, and its recorded output reaches the notebook.
import { execFile } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, expect, it } from 'vitest'

const BIN = fileURLToPath(new URL('../../cli/bin/presmium.mjs', import.meta.url))
const ADDON = fileURLToPath(new URL('..', import.meta.url))
const NOTEBOOK = fileURLToPath(new URL('../../render-notebook', import.meta.url))

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

const dir = mkdtempSync(join(tmpdir(), 'presmium-exec-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

function build(env: Record<string, string> = {}): Promise<{ code: number, output: string, cells: Cell[] }> {
  return new Promise((resolve) => {
    execFile(process.execPath, [BIN, 'build', '--to', 'notebook', '--out', 'out'], { cwd: dir, env: { ...process.env, ...env } }, (error, stdout, stderr) => {
      const cells = JSON.parse(readFileSync(join(dir, 'out/notebook/lecture.ipynb'), 'utf8')).cells as Cell[]
      resolve({ code: error ? Number(error.code) : 0, output: stdout + stderr, cells })
    })
  })
}

const code = (cells: Cell[]) => cells.filter(c => c.cell_type === 'code').map(c => ({ source: c.source.join(''), stdout: c.outputs?.map(o => o.text.join('')).join(''), tags: c.metadata.tags }))

const markdown = (cells: Cell[]) => cells.filter(c => c.cell_type === 'markdown').map(c => c.source.join('')).join('\n\n')

it('records the output at compile time; the run panel becomes a code cell with its parameters', async () => {
  writeFileSync(join(dir, 'lecture.md'), DECK.replace('x * k', 'x * 2'))
  const first = await build()
  expect(first.code, first.output).toBe(0)
  expect(first.output).toContain('code runs: 5 executed, 0 from cache')
  expect(code(first.cells)).toEqual([
    { source: 'n = 3\nfor i in range(n):\n    print("第", i)', stdout: '第 0\n第 1\n第 2\n' },
    { source: 'print(sum(range(5)))', stdout: '10\n' },
    // A run that timed out at compile time shows the recorded output (P-24) and is not run again.
    { source: 'while True: pass', stdout: 'rec-out', tags: ['skip-execution'] },
  ])
  // TypeScript runs on node at compile time; outside the kernel's language it stays a fenced block with its output.
  expect(markdown(first.cells)).toContain('```typescript\nconst xs: number[] = [1, 2, 3]\nconsole.log(xs.map(x => x * 2))\n```\n\n```text\n[2,4,6]\n```')
  // A JavaScript run panel shows its parameters, its code and its output: recorded at compile time,
  // including what a timer prints later, as a run in the browser would...
  expect(markdown(first.cells)).toContain("```javascript\nconst n = 3\nsetTimeout(() => console.log('compiled', n * 2), 30)\nconsole.log('now')\n```\n\n```text\nnow\ncompiled 6\n```")
  // ...or the recorded one, for a panel that runs only live.
  expect(markdown(first.cells)).toContain('```javascript\nconst n = 3\nconsole.log(n * 2)\n```\n\n```text\n预先录制：6\n```')

  // Without python3, the recordings in .presmium/freeze give the same notebook; a timeout is
  // never recorded, so the panel that timed out shows its recorded output again.
  const empty = join(dir, 'no-python')
  mkdirSync(empty)
  const cached = await build({ PATH: empty })
  expect(cached.code, cached.output).toBe(0)
  expect(cached.output).toContain('code runs: 0 executed, 4 from cache')
  expect(code(cached.cells)).toEqual(code(first.cells))
})

it('reports where a TypeScript run fails, at the line of the source', async () => {
  writeFileSync(join(dir, 'lecture.md'), DECK)
  const { code: exit, output, cells } = await build()
  expect(exit, output).toBe(0)
  expect(markdown(cells)).toContain('```text\nReferenceError: k is not defined (line 2)\n```')
})
