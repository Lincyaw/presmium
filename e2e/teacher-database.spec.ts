import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import type { IRBlock } from '../packages/kernel/src/ir.ts'
import { openSlide, presmium, useFixture } from './fixtures/deck.ts'

test.describe.configure({ mode: 'default' })
const teacher = useFixture('teacher-database', {
  to: 'web,slides,notebook',
  edit: dir => execFileSync('git', ['init', '--quiet'], { cwd: dir }),
})

function codes(blocks: IRBlock[]): IRBlock[] {
  return blocks.flatMap(block => [block, ...block.node.type === 'component' ? codes(block.node.children ?? []) : []])
    .filter(block => block.node.type === 'code')
}

test('a teacher can compile the source-backed shared database and hand students a runnable notebook', async () => {
  const deck = teacher()
  const check = await presmium(['check'], deck.dir)
  expect(check).toContain('0 errors, 0 warnings')
  const run = (section: string) => codes(deck.doc.sections.find(item => item.id === section)!.blocks)
    .flatMap(block => block.node.type === 'code' ? block.node.outputs ?? [] : [])
  expect(run('memory').map(output => output.stdout)).toEqual(['memory: 10\n'])
  expect(run('shared-session').map(output => output.stdout)).toEqual([
    "history: [('Ada', 10), ('Lin', 7), ('Ada', 12)]\nAda: 12\nmissing: None\n",
  ])
  expect(run('predict-update').map(output => output.stdout)).toEqual(['15 4\n'])
  expect(run('delete').map(output => output.stdout)).toEqual(['', "Lin: None\nlast record: ('Lin', None)\n"])

  const notebook = JSON.parse(readFileSync(join(deck.dir, 'dist/notebook/lecture.ipynb'), 'utf8')) as {
    cells: { cell_type: string, source: string[] | string, outputs?: { text?: string[] | string }[] }[]
  }
  const source = (cell: { source: string[] | string }) => Array.isArray(cell.source) ? cell.source.join('') : cell.source
  expect(notebook.cells.filter(cell => cell.cell_type === 'code').some(cell => source(cell).includes('def put(key, value):'))).toBe(true)
  expect(notebook.cells.filter(cell => cell.cell_type === 'code').some(cell => source(cell).includes('TemporaryDirectory'))).toBe(true)
  expect(notebook.cells.some(cell => source(cell).includes('def latest(records, wanted):'))).toBe(true)
  expect(notebook.cells.some(cell => source(cell).includes('<details>'))).toBe(true)
  const replay = execFileSync('python3', ['-c', [
    'import json, sys',
    'notebook = json.load(sys.stdin)',
    'scope = {}',
    'for cell in notebook["cells"]:',
    '    if cell["cell_type"] != "code": continue',
    '    source = "".join(cell["source"])',
    '    if "def latest(records, wanted):" in source: break',
    '    exec(source, scope)',
  ].join('\n')], { input: JSON.stringify(notebook), encoding: 'utf8' })
  expect(replay).toContain('memory: 10\n')
  expect(replay).toContain('Ada: 12\nmissing: None\n')
  expect(replay).toContain('records: 3\nrecovered Ada: 2\n')
})
