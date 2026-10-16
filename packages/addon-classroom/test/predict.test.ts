// Runs the real `presmium build --to notebook` on a deck with `{predict}` (P-68): in a notebook a
// predict is its question, its choices and what it reveals (the content of the step after it, the
// narration of that step included) folded away in a <details>, written in the deck's language.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { presmium } from '@presmium/cli/testing'
import { afterAll, expect, it } from 'vitest'

const ADDON = fileURLToPath(new URL('..', import.meta.url))
const NOTEBOOK = fileURLToPath(new URL('../../render-notebook', import.meta.url))

const DECK = `---
lang: zh-CN
plugins:
  - ${ADDON}
renderers:
  notebook:
    package: ${NOTEBOOK}
---

(merge)=
## 合并三轮

\`\`\`{predict} 合并三轮之后，词表中有几个新符号？
:choices: 1, 2, 3
\`\`\`

:::{slide}
:reveal:
三个：每一轮新增一个符号。
:::

每一轮只合并出现最多的那一对。

(next)=
## 下一节

:::{slide}
下一节的内容不在揭示内容中。
:::
`

interface Cell {
  cell_type: string
  source: string[]
  metadata: { presmium: { section: string } }
}

const dirs: string[] = []
afterAll(() => dirs.forEach(dir => rmSync(dir, { recursive: true, force: true })))

it('shows a predict as its question, its choices and what it reveals folded away', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'presmium-predict-'))
  dirs.push(dir)
  writeFileSync(join(dir, 'lecture.md'), DECK)
  const { code, stdout, stderr } = await presmium(dir, ['build', '--to', 'notebook', '--out', 'out'])
  expect(code, stdout + stderr).toBe(0)
  expect(stdout + stderr).toContain('no problems')
  const cells = (JSON.parse(readFileSync(join(dir, 'out/notebook/lecture.ipynb'), 'utf8')) as { cells: Cell[] }).cells
  const of = (section: string) => cells.filter(c => c.metadata.presmium.section === section).map(c => ({ type: c.cell_type, source: c.source.join('') }))

  // The section title, then the predict: nothing it reveals stands outside it.
  const [title, predict, ...rest] = of('merge')
  expect(title).toEqual({ type: 'markdown', source: '## 合并三轮' })
  expect(rest).toEqual([])
  expect(predict?.type).toBe('markdown')
  expect(predict?.source).toMatch(/^\*\*预测\*\*：合并三轮之后，词表中有几个新符号？\n\n1\.\s+1\n2\.\s+2\n3\.\s+3\n\n<details><summary>写下预测后展开<\/summary>\n\n三个：每一轮新增一个符号。\n\n每一轮只合并出现最多的那一对。\n\n<\/details>$/)
  expect(of('next').map(c => c.source).join('\n')).not.toContain('details')
})
