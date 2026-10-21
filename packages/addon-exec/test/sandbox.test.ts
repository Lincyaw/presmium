import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PRESMIUM_BIN, run } from '@lincyaw/cli/testing'
import type { CodeNode, IRDocument } from '@lincyaw/kernel'
import { afterAll, expect, it } from 'vitest'

const ADDON = fileURLToPath(new URL('..', import.meta.url))
const PLUGIN = fileURLToPath(new URL('./fixtures/presmium-fixture-sandbox', import.meta.url))
const NOTEBOOK = fileURLToPath(new URL('../../render-notebook', import.meta.url))
const dirs: string[] = []
afterAll(() => dirs.forEach(dir => rmSync(dir, { recursive: true, force: true })))

const DECK = `---
title: 沙箱
plugins:
  - ${ADDON}
renderers:
  notebook:
    package: ${NOTEBOOK}
---

## 代码

\`\`\`{code} python
:run:
import os
print(sorted(k for k in os.environ if k.startswith("FIXTURE")))
\`\`\`

\`\`\`{code} javascript
:run:
console.log(Object.keys(process.env).filter(k => k.startsWith('FIXTURE')).sort().join(','))
\`\`\`

\`\`\`{code} python
:run:
:session: s
x = 41
\`\`\`

\`\`\`{code} python
:run:
:session: s
print(x + 1)
\`\`\`
`

function workspace(sandbox: boolean): { dir: string, log: string } {
  const dir = mkdtempSync(join(tmpdir(), 'presmium-sandbox-'))
  dirs.push(dir)
  writeFileSync(join(dir, 'lecture.md'), DECK)
  const log = join(dir, 'calls.jsonl')
  if (sandbox) {
    writeFileSync(join(dir, 'presmium.workspace.yaml'), `settings:\n  presmium.workspace:\n    plugins: [presmium-fixture-sandbox]\n  fixture.sandbox:\n    log: ${JSON.stringify(log)}\n`)
    mkdirSync(join(dir, 'node_modules'))
    cpSync(PLUGIN, join(dir, 'node_modules/presmium-fixture-sandbox'), { recursive: true })
    writeFileSync(log, '')
  }
  return { dir, log }
}

const KEPT = { PATH: process.env.PATH!, HOME: process.env.HOME!, LANG: 'C.UTF-8', FIXTURE_PLAIN: 'shown' }
const ENV = { ...KEPT, FIXTURE_API_TOKEN: 'hidden', PRESMIUM_FIXTURE: 'hidden' }

async function build(dir: string): Promise<IRDocument> {
  const result = await run(process.execPath, [PRESMIUM_BIN, 'build'], { cwd: dir, env: ENV })
  expect(result.code, result.stdout + result.stderr).toBe(0)
  return JSON.parse(readFileSync(join(dir, 'dist/ir.json'), 'utf8')) as IRDocument
}

const recorded = (doc: IRDocument) => doc.sections[0]!.blocks.flatMap(block => block.node.type === 'code' ? [(block.node as CodeNode).outputs?.[0]?.stdout] : [])

it('runs Python and JavaScript through the process sandbox with the run\'s environment, recording what a build without it records; a session in one call', async () => {
  const sandboxed = workspace(true)
  const doc = await build(sandboxed.dir)
  const calls = readFileSync(sandboxed.log, 'utf8').trim().split('\n').map(line => JSON.parse(line) as { argv: string[], files: Record<string, string>, collect: string[], env: Record<string, string> })
  expect(calls).toHaveLength(3)
  for (const call of calls) {
    expect(Object.keys(call.files)).toContain('.presmium/request.json')
    expect(call.env).toEqual({
      ...KEPT,
      GOMAXPROCS: '1', RAYON_NUM_THREADS: '1', OMP_NUM_THREADS: '1', OPENBLAS_NUM_THREADS: '1',
      MKL_NUM_THREADS: '1', NUMEXPR_MAX_THREADS: '1', POLARS_MAX_THREADS: '1', UV_THREADPOOL_SIZE: '2',
      BLIS_NUM_THREADS: '1', VECLIB_MAXIMUM_THREADS: '1', NUMEXPR_NUM_THREADS: '1',
    })
  }
  expect(calls.map(call => call.argv[0])).toEqual(['python3', process.execPath, 'python3'])
  const session = JSON.parse(calls[2]!.files['.presmium/request.json']!) as { runs: { code: string }[] }
  expect(session.runs.map(r => r.code)).toEqual(['x = 41', 'print(x + 1)'])
  expect(calls[2]!.collect).toHaveLength(2)

  expect(recorded(doc)).toEqual(["['FIXTURE_PLAIN']\n", 'FIXTURE_PLAIN\n', '', '42\n'])
  expect(recorded(await build(workspace(false).dir))).toEqual(recorded(doc))
})
