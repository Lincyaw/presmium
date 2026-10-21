import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { presmium } from '@lincyaw/cli/testing'
import type { ComponentNode, IRDocument } from '@lincyaw/kernel'
import { expect, it } from 'vitest'

const ADDON = fileURLToPath(new URL('..', import.meta.url))
const NOTEBOOK = fileURLToPath(new URL('../../render-notebook', import.meta.url))

it('keeps a run panel\'s query value and MIME display outputs in notebook cells and static fallback', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'presmium-panel-outputs-'))
  try {
    writeFileSync(join(dir, 'lecture.md'), `---
plugins:
  - ${ADDON}
renderers:
  notebook: { package: ${NOTEBOOK} }
---

## Query

\`\`\`{run-panel} python
import sqlite3
from IPython.display import HTML
db = sqlite3.connect(':memory:')
db.execute('create table teachers (name text)')
db.execute('insert into teachers values (?)', ('Ada',))
display(HTML('<table><tr><td>Ada</td></tr></table>'))
db.execute('select name from teachers').fetchall()
\`\`\`
`)
    const result = await presmium(dir, ['build', '--to', 'notebook'])
    expect(result.code, result.stdout + result.stderr).toBe(0)
    const notebook = JSON.parse(readFileSync(join(dir, 'dist/notebook/lecture.ipynb'), 'utf8')) as { cells: { cell_type: string, outputs?: unknown[] }[] }
    const outputs = notebook.cells.find(cell => cell.cell_type === 'code')?.outputs
    expect(outputs).toEqual([
      { output_type: 'display_data', data: { 'text/html': '<table><tr><td>Ada</td></tr></table>', 'text/plain': '<_PmHTML object>' }, metadata: {} },
      { output_type: 'execute_result', data: { 'text/plain': "[('Ada',)]" }, metadata: {}, execution_count: null },
    ])
    const doc = JSON.parse(readFileSync(join(dir, 'dist/ir.json'), 'utf8')) as IRDocument
    const panel = doc.sections[0]!.blocks[0]!.node as ComponentNode
    expect(panel.props.compiledOutput).toContain("[('Ada',)]")
    expect(JSON.stringify(panel.fallback)).toContain("[('Ada',)]")
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
