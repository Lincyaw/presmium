// Runs the real `presmium build --to notebook` on a deck with the classroom directives:
// in a notebook a quiz is a question list and an exercise is its starter code and checks as code cells.
// The build also warns about a label that looks like a generated block id.
import { execFile } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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

(quiz)=
## 测验

\`\`\`{quiz}
BPE 每一轮合并哪一对相邻符号？

- [ ] 最先出现的一对
- [x] 出现次数最多的一对
\`\`\`

(exercise)=
## 练习

\`\`\`\`{exercise} python
写函数 \`mean(xs)\`，返回平均值。

\`\`\`python
def mean(xs):
    return sum(xs) / len(xs)
\`\`\`

\`\`\`python
assert mean([1, 2, 3]) == 2
\`\`\`
\`\`\`\`

(live)=
## 课堂

\`\`\`{question-box}
有疑问就在这里提出。
\`\`\`

\`\`\`{pulse} 讲清楚了吗？
\`\`\`

(labels)=
## 标签

(step-2)=
这一段的标签像生成的块 ID。
`

interface Cell {
  cell_type: string
  source: string[]
  metadata: { presmium: { section: string } }
}

const dir = mkdtempSync(join(tmpdir(), 'presmium-classroom-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

it('shows a quiz as a question list and an exercise as code cells; live-only components leave no cells; warns about labels like generated ids', async () => {
  writeFileSync(join(dir, 'lecture.md'), DECK)
  const { code, output } = await new Promise<{ code: number, output: string }>((resolve) => {
    execFile(process.execPath, [BIN, 'build', '--to', 'notebook', '--out', 'out'], { cwd: dir }, (error, stdout, stderr) => {
      resolve({ code: error ? Number(error.code) : 0, output: stdout + stderr })
    })
  })
  expect(code, output).toBe(0)
  expect(output).not.toContain('not rendered')
  expect(output).toMatch(/lecture\.md:\d+ +warning +label \(step-2\)= ends in -<number> like a generated block id/)
  const cells = (JSON.parse(readFileSync(join(dir, 'out/notebook/lecture.ipynb'), 'utf8')) as { cells: Cell[] }).cells
  const of = (section: string) => cells.filter(c => c.metadata.presmium.section === section).map(c => ({ type: c.cell_type, source: c.source.join('') }))

  // One Markdown cell with the section title.
  const [quiz, ...rest] = of('quiz')
  expect(rest).toEqual([])
  expect(quiz?.type).toBe('markdown')
  expect(quiz?.source).toContain('BPE 每一轮合并哪一对相邻符号？')
  expect(quiz?.source).toMatch(/1\.\s+最先出现的一对\n2\.\s+出现次数最多的一对/)
  expect(quiz?.source).toContain('<details><summary>答案</summary>B</details>')

  expect(of('exercise').slice(1)).toEqual([
    { type: 'markdown', source: '**练习**\n\n写函数 `mean(xs)`，返回平均值。' },
    { type: 'code', source: 'def mean(xs):\n    return sum(xs) / len(xs)' },
    { type: 'code', source: '# 校验：先运行上面的单元格，再运行这个单元格；没有报错就是通过。\nassert mean([1, 2, 3]) == 2' },
  ])

  // Only the section title: the question box and the pulse need a classroom.
  expect(of('live')).toEqual([{ type: 'markdown', source: '## 课堂' }])
})
