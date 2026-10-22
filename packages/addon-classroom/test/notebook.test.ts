import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { presmium } from '@lincyaw/cli/testing'
import { afterAll, expect, it } from 'vitest'

const ADDON = fileURLToPath(new URL('..', import.meta.url))
const NOTEBOOK = fileURLToPath(new URL('../../render-notebook', import.meta.url))

const headmatter = (lang: string) => `---
lang: ${lang}
plugins:
  - ${ADDON}
renderers:
  notebook:
    package: ${NOTEBOOK}
---
`

const DECK = `${headmatter('zh-CN')}
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

const FRENCH = `${headmatter('fr')}
(exercise)=
## Exercice

\`\`\`\`{exercise} python
Press {kbd}\`Ctrl\` and compute {math}\`x^2\`, H{sub}\`2\`O.

![a dot](img/dot.svg)

\`\`\`python
def square(x):
    return x
\`\`\`

\`\`\`python
assert square(2) == 4
\`\`\`
\`\`\`\`

(quiz)=
## Quiz

\`\`\`{quiz}
Which items make a task list?

~~~md
- [x] an example in a fence is no option
~~~

- [ ] the first
- [x] the second
\`\`\`

(pulse)=
## Pulse

\`\`\`{pulse}
\`\`\`
`

interface Cell {
  cell_type: string
  source: string[]
  metadata: { presmium: { section: string } }
}

const dirs: string[] = []
afterAll(() => dirs.forEach(dir => rmSync(dir, { recursive: true, force: true })))

async function notebook(deck: string, files: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'presmium-classroom-'))
  dirs.push(dir)
  writeFileSync(join(dir, 'lecture.md'), deck)
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(dir, path, '..'), { recursive: true })
    writeFileSync(join(dir, path), text)
  }
  const { code, stdout, stderr } = await presmium(dir, ['build', '--to', 'notebook', '--out', 'out'])
  const output = stdout + stderr
  expect(code, output).toBe(0)
  const cells = (JSON.parse(readFileSync(join(dir, 'out/notebook/lecture.ipynb'), 'utf8')) as { cells: Cell[] }).cells
  const of = (section: string) => cells.filter(c => c.metadata.presmium.section === section).map(c => ({ type: c.cell_type, source: c.source.join('') }))
  return { dir, output, of }
}

it('shows a quiz as a question list and an exercise as code cells; live-only components leave no cells; warns about labels like generated ids', async () => {
  const { output, of } = await notebook(DECK)
  expect(output).not.toContain('not rendered')
  expect(output).toMatch(/lecture\.md:\d+ +warning +label \(step-2\)= ends in -<number> like a generated block id/)

  const [quiz, ...rest] = of('quiz')
  expect(rest).toEqual([])
  expect(quiz?.type).toBe('markdown')
  expect(quiz?.source).toContain('BPE 每一轮合并哪一对相邻符号？')
  expect(quiz?.source).toMatch(/A\. 最先出现的一对\n\nB\. 出现次数最多的一对/)
  expect(quiz?.source).not.toMatch(/^1\.\s/m)
  expect(quiz?.source).toContain('<details><summary>答案</summary>B</details>')

  expect(of('exercise').slice(1)).toEqual([
    { type: 'markdown', source: '**练习**\n\n写函数 `mean(xs)`，返回平均值。' },
    { type: 'code', source: 'def mean(xs):\n    return sum(xs) / len(xs)' },
    { type: 'code', source: '# 校验：先运行上面的单元格，再运行这个单元格；没有报错就是通过。\nassert mean([1, 2, 3]) == 2' },
  ])

  expect(of('live')).toEqual([{ type: 'markdown', source: '## 课堂' }])
})

it('writes an exercise\'s prompt as the deck\'s Markdown, its local image copied, in the deck\'s language; a fenced task list is no option', async () => {
  const { dir, of } = await notebook(FRENCH, { 'img/dot.svg': '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"/>' })
  const [prompt, starter, checks] = of('exercise').slice(1)
  expect(prompt?.source).toContain('**Exercise**')
  expect(prompt?.source).toContain('<kbd>Ctrl</kbd>')
  expect(prompt?.source).toContain('$x^2$')
  expect(prompt?.source).toContain('H<sub>2</sub>O')
  const [media] = readdirSync(join(dir, 'out/notebook/media'))
  expect(media).toMatch(/^[\da-f]{8}-dot\.svg$/)
  expect(prompt?.source).toContain(`![a dot](media/${media})`)
  expect(starter).toEqual({ type: 'code', source: 'def square(x):\n    return x' })
  expect(checks).toEqual({ type: 'code', source: '# Check: run the cell above, then this one; no error means it passes.\nassert square(2) == 4' })

  const [quiz] = of('quiz')
  expect(quiz?.source).toContain('- [x] an example in a fence is no option')
  expect(quiz?.source).toMatch(/A\. the first\n\nB\. the second\n/)
  expect(quiz?.source).not.toMatch(/C\.\s/)
  expect(quiz?.source).toContain('<details><summary>Answer</summary>B</details>')

  const ir = JSON.parse(readFileSync(join(dir, 'out/ir.json'), 'utf8')) as { meta: { lang: string }, sections: { id: string, blocks: { node: { props?: Record<string, unknown> } }[] }[] }
  expect(ir.meta.lang).toBe('fr')
  const pulse = ir.sections.find(s => s.id === 'pulse')!.blocks.map(b => b.node.props).find(props => props?.question)
  expect(pulse).toMatchObject({ question: 'Did you follow this section?', levels: ['Got it', 'A bit unclear', 'Lost'] })
})
