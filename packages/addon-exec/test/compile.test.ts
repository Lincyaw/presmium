// Runs the real `presmium build --to notebook` on a deck outside git: code runs at compile time
// with the local python3 executor, and its recorded output reaches the notebook.
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
`

interface Cell {
  cell_type: string
  source: string[]
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

const code = (cells: Cell[]) => cells.filter(c => c.cell_type === 'code').map(c => ({ source: c.source.join(''), stdout: c.outputs?.map(o => o.text.join('')).join('') }))

it('records the output at compile time; the run panel becomes a code cell with its parameters', async () => {
  writeFileSync(join(dir, 'lecture.md'), DECK)
  const first = await build()
  expect(first.code, first.output).toBe(0)
  expect(first.output).toContain('code runs: 2 executed, 0 from cache')
  expect(code(first.cells)).toEqual([
    { source: 'n = 3\nfor i in range(n):\n    print("第", i)', stdout: '第 0\n第 1\n第 2\n' },
    { source: 'print(sum(range(5)))', stdout: '10\n' },
  ])

  // Without python3, the recordings in .presmium/freeze give the same notebook.
  const empty = join(dir, 'no-python')
  mkdirSync(empty)
  const cached = await build({ PATH: empty })
  expect(cached.code, cached.output).toBe(0)
  expect(cached.output).toContain('code runs: 0 executed, 2 from cache')
  expect(code(cached.cells)).toEqual(code(first.cells))
})
