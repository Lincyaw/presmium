import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { presmium } from '@lincyaw/cli/testing'
import { afterAll, beforeAll, expect, it } from 'vitest'

const NOTEBOOK = fileURLToPath(new URL('..', import.meta.url))

const DECK = `---
lang: zh-CN
renderers:
  notebook:
    package: ${NOTEBOOK}
---

(weeks)=
## 课程

::::{grid} 1 1 2 3
:::{card} 第 1 周：智能体环路
:link: https://example.com/week-01/
读、想、做的循环。
+++
{button}\`进入讲义 <https://example.com/week-01/lecture>\`
:::
:::{card} 第 2 周：上下文
上下文窗口里放什么。
:::
::::

(install)=
## 安装

::::{tab-set}
:::{tab-item} Python
:sync: py
用 pip 安装。
:::
:::{tab-item} JavaScript
:sync: js
用 npm 安装。
:::
::::
`

let dir: string
let output: string
let cells: { source: string[], metadata: { presmium: { section: string } } }[]

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'presmium-cards-'))
  writeFileSync(join(dir, 'lecture.md'), DECK)
  const build = await presmium(dir, ['build', '--to', 'notebook', '--out', 'out'])
  output = build.stdout + build.stderr
  expect(build.code, output).toBe(0)
  cells = JSON.parse(readFileSync(join(dir, 'out/notebook/lecture.ipynb'), 'utf8')).cells
}, 30_000)

afterAll(() => rmSync(dir, { recursive: true, force: true }))

const markdown = (section: string) => cells.filter(c => c.metadata.presmium.section === section).map(c => c.source.join('')).join('\n\n')

it('writes cards and tabs as small headings over their paragraphs, a button as a link (P-46)', () => {
  expect(markdown('weeks')).toBe([
    '## 课程',
    '#### [第 1 周：智能体环路](https://example.com/week-01/)',
    '读、想、做的循环。',
    '[进入讲义](https://example.com/week-01/lecture)',
    '#### 第 2 周：上下文',
    '上下文窗口里放什么。',
  ].join('\n\n'))
  expect(markdown('install')).toBe(['## 安装', '#### Python', '用 pip 安装。', '#### JavaScript', '用 npm 安装。'].join('\n\n'))
})

it('lists the cards, the grid and the tab set as degraded in the build report (P-46)', () => {
  expect(output).toMatch(/lecture\.md:\d+ +warning +weeks#grid-1: degraded in the notebook, which has no Jupyter form for grid, card/)
  expect(output).toMatch(/lecture\.md:\d+ +warning +install#tab-set-1: degraded in the notebook, which has no Jupyter form for tabSet/)
})
