import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { presmium } from '@presmium/cli/testing'
import type { CodeNode, IRDocument } from '@presmium/kernel'
import { afterAll, expect, it } from 'vitest'

const ADDON = fileURLToPath(new URL('..', import.meta.url))
const NOTEBOOK = fileURLToPath(new URL('../../render-notebook', import.meta.url))
const dirs: string[] = []
afterAll(() => dirs.forEach(dir => rmSync(dir, { recursive: true, force: true })))

const deck = (start: number) => `---
plugins:
  - ${ADDON}
renderers:
  notebook:
    package: ${NOTEBOOK}
---

## 会话

\`\`\`{code} python
:run:
:session: counter
x = ${start}
print("x =", x)
\`\`\`

\`\`\`{code} python
:run:
:session: counter
print(x + 1)
\`\`\`
`

it('records what the session\'s blocks print in one interpreter, runs nothing again unchanged, and the whole session again when its first block changes', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'presmium-session-'))
  dirs.push(dir)
  const build = async () => {
    const result = await presmium(dir, ['build'])
    expect(result.code, result.stdout + result.stderr).toBe(0)
    const doc = JSON.parse(readFileSync(join(dir, 'dist/ir.json'), 'utf8')) as IRDocument
    const outputs = doc.sections[0]!.blocks.map(block => (block.node as CodeNode).outputs?.[0]?.stdout)
    return { outputs, runs: /code runs: \d+ executed, \d+ from cache/.exec(result.stdout)?.[0] }
  }

  writeFileSync(join(dir, 'lecture.md'), deck(41))
  expect(await build()).toEqual({ outputs: ['x = 41\n', '42\n'], runs: 'code runs: 2 executed, 0 from cache' })
  expect(await build()).toEqual({ outputs: ['x = 41\n', '42\n'], runs: 'code runs: 0 executed, 2 from cache' })

  writeFileSync(join(dir, 'lecture.md'), deck(9))
  expect(await build()).toEqual({ outputs: ['x = 9\n', '10\n'], runs: 'code runs: 2 executed, 0 from cache' })
})
