// Builds the notebook of the demo deck (examples/demo) with the real `presmium build` and runs
// it from top to bottom with the local Jupyter stack, as a reader would (P-75).
import { execFile, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, expect, it } from 'vitest'

const DEMO = fileURLToPath(new URL('../../../examples/demo', import.meta.url))
const CHECKER = fileURLToPath(new URL('./notebook.py', import.meta.url))
const CLI = join(dirname(createRequire(import.meta.url).resolve('@presmium/cli')), '../bin/presmium.mjs')
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

function run(command: string, args: string[]): Promise<{ code: number, stdout: string, stderr: string }> {
  return new Promise((resolve) => {
    execFile(command, args, { maxBuffer: 16 << 20 }, (error, stdout, stderr) => resolve({ code: error ? Number(error.code) : 0, stdout, stderr }))
  })
}

const streams = (outputs: Output[] = []) => outputs.filter(o => o.output_type === 'stream').map(o => `${o.name}: ${[o.text ?? ''].flat().join('')}`)

const out = mkdtempSync(join(tmpdir(), 'presmium-demo-notebook-'))
afterAll(() => rmSync(out, { recursive: true, force: true }))

it.skipIf(!JUPYTER)('runs from top to bottom: no cell hangs, recorded outputs come back, a cell that never ends keeps its recorded output', async () => {
  const build = await run(process.execPath, [CLI, 'build', DEMO, '--to', 'notebook', '--out', out])
  expect(build.code, build.stdout + build.stderr).toBe(0)
  const file = join(out, 'notebook/lecture.ipynb')
  const written = (JSON.parse(readFileSync(file, 'utf8')).cells as Cell[]).filter(cell => cell.cell_type === 'code')

  const result = await run('python3', [CHECKER, 'run-all', file])
  expect(result.code, result.stderr).toBe(0)
  const ran = JSON.parse(result.stdout) as Cell[]
  expect(ran).toHaveLength(written.length)

  // The timeout demo (`while True`) is skipped and shows the output recorded for it.
  const endless = ran.filter(cell => cell.metadata.tags?.includes('skip-execution'))
  expect(endless.map(cell => cell.metadata.presmium.section)).toEqual(['exec-fallback'])
  expect(streams(endless[0]!.outputs)).toEqual(['stdout: x = 1.4142135623730951（√2，预先录制）'])

  // Every other cell with output recorded at compile time gives that output again.
  const recorded = written.map((cell, i) => [cell, ran[i]!] as const).filter(([cell]) => cell.outputs?.length && !cell.metadata.tags)
  expect(recorded.length).toBeGreaterThanOrEqual(2)
  for (const [cell, again] of recorded) expect(streams(again.outputs)).toEqual(streams(cell.outputs))

  // Only the check of an exercise fails, as it does until the learner solves the exercise.
  const failed = ran.filter(cell => cell.outputs?.some(o => o.output_type === 'error'))
  expect(failed.flatMap(cell => cell.metadata.presmium.blocks).every(block => block.startsWith('pm-exercise'))).toBe(true)
}, 120_000)
