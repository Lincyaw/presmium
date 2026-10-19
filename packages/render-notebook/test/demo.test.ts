import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { presmium, run } from '@presmium/cli/testing'
import { afterAll, expect, it } from 'vitest'

const DEMO = fileURLToPath(new URL('../../../e2e/fixtures/regression', import.meta.url))
const EXEC_FIXTURE = fileURLToPath(new URL('../../../e2e/fixtures/exec/panels', import.meta.url))
const CHECKER = fileURLToPath(new URL('./notebook.py', import.meta.url))
const JUPYTER = spawnSync('python3', ['-c', 'import nbformat, nbclient, ipykernel']).status === 0

interface Output {
  output_type: string
  name?: string
  text?: string | string[]
}

interface Cell {
  cell_type: string
  metadata: { tags?: string[], presmium: { section: string, blocks: string[] } }
  outputs?: Output[]
}

const streams = (outputs: Output[] = []) => outputs.filter(o => o.output_type === 'stream').reduce<{ name?: string, text: string }[]>((all, o) => {
  const text = [o.text ?? ''].flat().join('')
  const last = all.at(-1)
  if (last && last.name === o.name) last.text += text
  else all.push({ name: o.name, text })
  return all
}, []).map(({ name, text }) => `${name}: ${text}`)

const temporary: string[] = []
afterAll(() => {
  for (const dir of temporary) rmSync(dir, { recursive: true, force: true })
})

async function buildAndRun(deck: string) {
  const out = mkdtempSync(join(tmpdir(), 'presmium-notebook-run-'))
  temporary.push(out)
  const build = await presmium(deck, ['build', '--to', 'notebook', '--out', out])
  expect(build.code, build.stdout + build.stderr).toBe(0)
  const file = join(out, 'notebook/lecture.ipynb')
  const written = (JSON.parse(readFileSync(file, 'utf8')).cells as Cell[]).filter(cell => cell.cell_type === 'code')

  const result = await run('python3', [CHECKER, 'run-all', file])
  expect(result.code, result.stderr).toBe(0)
  const ran = JSON.parse(result.stdout) as Cell[]
  expect(ran).toHaveLength(written.length)

  const recorded = written.map((cell, i) => [cell, ran[i]!] as const).filter(([cell]) => cell.outputs?.length && !cell.metadata.tags)
  for (const [cell, again] of recorded) expect(streams(again.outputs)).toEqual(streams(cell.outputs))
  return { written, ran, recorded }
}

it.skipIf(!JUPYTER)('the demo lecture runs from top to bottom: recorded outputs come back, only exercise checks fail', async () => {
  const { recorded, ran } = await buildAndRun(DEMO)
  expect(recorded.length).toBeGreaterThanOrEqual(1)
  const failed = ran.filter(cell => cell.outputs?.some(o => o.output_type === 'error'))
  expect(failed.flatMap(cell => cell.metadata.presmium.blocks).every(block => block.startsWith('pm-exercise'))).toBe(true)
}, 120_000)

it.skipIf(!JUPYTER)('a cell that never ends is skipped and keeps its recorded output; no cell hangs', async () => {
  const work = join(DEMO, '.presmium')
  mkdirSync(work, { recursive: true })
  const deck = mkdtempSync(join(work, 'notebook-exec-'))
  temporary.push(deck)
  cpSync(EXEC_FIXTURE, deck, { recursive: true })
  writeFileSync(join(deck, '.gitignore'), '*\n')

  const { recorded, ran } = await buildAndRun(deck)
  const endless = ran.filter(cell => cell.metadata.tags?.includes('skip-execution'))
  expect(endless.map(cell => cell.metadata.presmium.section)).toEqual(['exec-fallback'])
  expect(streams(endless[0]!.outputs)).toEqual(['stdout: x = 1.4142135623730951（√2，预先录制）'])
  expect(recorded.length).toBeGreaterThanOrEqual(2)
}, 120_000)
