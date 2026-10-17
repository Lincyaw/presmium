// Python as the author writes it, with the real `presmium build` and `presmium check` on decks outside
// git: the value of a last expression is the run's `execute_result`, as in Jupyter (D-8), in the IR (which
// the web form shows), the slides and the notebook; `presmium check` warns of Python for the browser that
// imports what the browser lacks (D-5); both warn of a stepwise run whose `:steps:` is not the number of
// lines its code executes, at the directive.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { presmium } from '@presmium/cli/testing'
import type { CodeNode, IRDocument } from '@presmium/kernel'
import { afterAll, expect, it } from 'vitest'

const ADDON = fileURLToPath(new URL('..', import.meta.url))
const NOTEBOOK = fileURLToPath(new URL('../../render-notebook', import.meta.url))
const SLIDES = fileURLToPath(new URL('../../render-slides', import.meta.url))
const dirs: string[] = []
afterAll(() => dirs.forEach(dir => rmSync(dir, { recursive: true, force: true })))

function deck(body: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'presmium-python-'))
  dirs.push(dir)
  writeFileSync(join(dir, 'lecture.md'), `---
plugins:
  - ${ADDON}
renderers:
  notebook:
    package: ${NOTEBOOK}
  slides:
    package: ${SLIDES}
    theme: none
---
${body}`)
  return dir
}

const FENCE = '```'

it('shows the value of a last expression as Jupyter does: in the IR, the slides and the notebook; a `;` or None shows nothing', async () => {
  const dir = deck(`
## 值

${FENCE}{code} python
:run:
counts = {'a': 3, 'b': 1}
counts
${FENCE}

${FENCE}{code} python
:run:
counts = {'a': 3}
counts;
${FENCE}

${FENCE}{code} python
:run:
print('printed')
${FENCE}
`)
  const built = await presmium(dir, ['build', '--to', 'slides,notebook'])
  expect(built.code, built.stdout + built.stderr).toBe(0)
  const doc = JSON.parse(readFileSync(join(dir, 'dist/ir.json'), 'utf8')) as IRDocument
  const [value, hidden, printed] = doc.sections[0]!.blocks.map(block => (block.node as CodeNode).outputs![0]!)
  expect(value!.outputs).toEqual([{ output_type: 'execute_result', data: { 'text/plain': '{\'a\': 3, \'b\': 1}' }, metadata: {} }])
  expect(hidden!.outputs).toEqual([])
  expect(printed!.outputs).toEqual([{ output_type: 'stream', name: 'stdout', text: 'printed\n' }])

  expect(readFileSync(join(dir, '.presmium/slides/slides.md'), 'utf8')).toContain('```text\n{\'a\': 3, \'b\': 1}\n```')
  const notebook = JSON.parse(readFileSync(join(dir, 'dist/notebook/lecture.ipynb'), 'utf8')) as { cells: { cell_type: string, outputs?: Record<string, unknown>[] }[] }
  expect(notebook.cells.find(cell => cell.cell_type === 'code')?.outputs).toEqual([
    expect.objectContaining({ output_type: 'execute_result', data: { 'text/plain': ['{\'a\': 3, \'b\': 1}'] }, execution_count: 1 }),
  ])
}, 180_000)

it('warns, in presmium check, of Python for the browser that imports what the browser lacks, at its block', async () => {
  const dir = deck(`
## 浏览器中的 Python

${FENCE}{code} python
:run: both
import numpy as np
from collections import Counter
import presmium_gpu
print(np.arange(3))
${FENCE}

${FENCE}{code} python
:run: compile
import numpy
${FENCE}

${FENCE}{run-panel} python
import os, pandas.io as pio
${FENCE}

${FENCE}{step-run} python
:steps: 1
import json
${FENCE}
`)
  const lines = readFileSync(join(dir, 'lecture.md'), 'utf8').split('\n')
  const line = (text: string) => lines.indexOf(text) + 1
  const checked = await presmium(dir, ['check', '--json'])
  const findings = (JSON.parse(checked.stdout) as { findings: { checkId: string, severity: string, message: string, source?: { line: number } }[] }).findings
    .filter(f => f.checkId === 'presmium.exec')
  expect(findings).toEqual([
    expect.objectContaining({ severity: 'warning', message: 'this Python code also runs in the browser, which has the standard library only: numpy cannot be imported there', source: expect.objectContaining({ line: line('```{code} python') }) }),
    expect.objectContaining({ severity: 'warning', message: 'this Python code also runs in the browser, which has the standard library only: pandas cannot be imported there', source: expect.objectContaining({ line: line('```{run-panel} python') }) }),
  ])
}, 120_000)

it('warns, in presmium build and check, of a stepwise run whose :steps: is not the number of lines its code executes, at the directive', async () => {
  const dir = deck(`
## 分步

${FENCE}{step-run} python
:steps: 5
total = 0
for n in range(1, 4):
    total += n
print(total)
${FENCE}

${FENCE}{step-run} python
:steps: 3
:params: {n: 1}
x = n
y = x + 1
print(y)
${FENCE}
`)
  const line = readFileSync(join(dir, 'lecture.md'), 'utf8').split('\n').indexOf('```{step-run} python') + 1
  const message = '{step-run} declares :steps: 5, but its code executes 9 lines: the slide\'s steps do not match the lines'
  for (const command of [['build', '--to', 'notebook'], ['check']]) {
    const { stdout, stderr } = await presmium(dir, command)
    expect(stdout + stderr).toContain(`lecture.md:${line}  warning  ${message}`)
    expect(stdout + stderr).not.toMatch(/declares :steps: 3/)
  }
}, 120_000)
