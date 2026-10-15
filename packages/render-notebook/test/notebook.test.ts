// Runs the real `presmium build` on a copy of ./fixtures and checks the notebook it writes;
// the local Jupyter stack (python3 with nbformat, nbclient and ipykernel) validates and runs it.
import { execFile, spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { IRDocument, MdastNode } from '@presmium/kernel'
import { afterAll, beforeAll, expect, it } from 'vitest'

const PACKAGE = fileURLToPath(new URL('..', import.meta.url))
const CLI = join(dirname(createRequire(import.meta.url).resolve('@presmium/cli')), '../bin/presmium.mjs')
const JUPYTER = spawnSync('python3', ['-c', 'import nbformat, nbclient, ipykernel']).status === 0
const NO_JUPYTER = 'needs python3 with nbformat, nbclient and ipykernel'

interface Cell {
  id: string
  cell_type: string
  source: string[]
  outputs?: { output_type: string, name?: string, text?: string | string[] }[]
}

interface Run {
  code: number
  stdout: string
  stderr: string
}

function run(command: string, args: string[], cwd?: string): Promise<Run> {
  return new Promise((resolve) => {
    execFile(command, args, { cwd, maxBuffer: 16 << 20 }, (error, stdout, stderr) => {
      resolve({ code: error ? Number(error.code) : 0, stdout, stderr })
    })
  })
}

let dir: string
let build: Run
let ir: IRDocument
let file: string
let cells: Cell[]

// The deck is built outside git, so the build cache stays out of the repository;
// the renderer is found the way a deck finds it, in node_modules.
beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'presmium-notebook-'))
  cpSync(fileURLToPath(new URL('./fixtures', import.meta.url)), dir, { recursive: true })
  mkdirSync(join(dir, 'node_modules/@presmium'), { recursive: true })
  symlinkSync(PACKAGE, join(dir, 'node_modules/@presmium/render-notebook'))
  build = await run(process.execPath, [CLI, 'build', '--out', 'out'], dir)
  ir = JSON.parse(readFileSync(join(dir, 'out/ir.json'), 'utf8'))
  file = join(dir, 'out/notebook/lecture.ipynb')
  cells = JSON.parse(readFileSync(file, 'utf8')).cells
}, 30_000)

afterAll(() => rmSync(dir, { recursive: true, force: true }))

const markdown = () => cells.filter(c => c.cell_type === 'markdown').map(c => c.source.join('')).join('\n\n')

it.skipIf(!JUPYTER)(`passes nbformat validation (${NO_JUPYTER})`, async () => {
  expect(build.code, build.stdout + build.stderr).toBe(0)
  const result = await run('python3', [join(PACKAGE, 'test/notebook.py'), 'validate', file])
  expect(result.code, result.stderr).toBe(0)
})

it.skipIf(!JUPYTER)(`reproduces the recorded outputs when its code cells run in order on the local Python (${NO_JUPYTER})`, async () => {
  const result = await run('python3', [join(PACKAGE, 'test/notebook.py'), 'run', file])
  expect(result.code, result.stderr).toBe(0)
  const executed: Cell['outputs'][] = JSON.parse(result.stdout)
  const code = cells.filter(c => c.cell_type === 'code')
  const streams = (outputs: Cell['outputs'] = []) => {
    expect(outputs.every(o => o.output_type === 'stream')).toBe(true)
    return Object.fromEntries(['stdout', 'stderr'].map(name => [name, outputs.filter(o => o.name === name).flatMap(o => o.text ?? []).join('')]))
  }
  // Two cells ran at build time, one on stdout and stderr; the cell of the quiz extension has no output.
  expect(code.map(c => streams(c.outputs))).toEqual([
    { stdout: '合计 55\n', stderr: '' },
    { stdout: '[0, 1, 4, 9]\n', stderr: '这一行写到标准错误\n' },
    { stdout: '', stderr: '' },
  ])
  expect(executed.map(streams)).toEqual(code.map(c => streams(c.outputs)))
}, 60_000)

it('puts the section titles and all narration text in Markdown cells', () => {
  expect(build.code, build.stdout + build.stderr).toBe(0)
  const text = (node: MdastNode): string[] => typeof node.value === 'string' ? [node.value] : (node.children ?? []).flatMap(text)
  const narration = ir.sections.flatMap(s => s.blocks.filter(b => b.role === 'narration' && (!b.only || b.only.includes('notebook'))))
  expect(narration.length).toBeGreaterThan(5)
  for (const section of ir.sections) expect(markdown()).toContain(`# ${section.title}\n`)
  for (const block of narration) {
    if (block.node.type !== 'markdown') throw new Error(`narration ${block.id} is not markdown`)
    for (const value of text(block.node.mdast)) expect(markdown()).toContain(value)
  }
  // Code in another language than the kernel's stays readable as a fenced block; `{only} web` is left out.
  expect(markdown()).toContain('```bash\necho 不是内核语言的代码\n```')
  expect(markdown()).not.toContain('只在网页中出现')
})

it('copies the local files that the images and links it shows point to next to the notebook and links the copies', () => {
  // The image is written relative to an included page, the link in a component fallback relative to the entry.
  const image = /!\[点图\]\((media\/[\w-]+\.svg)\)/.exec(markdown())?.[1]
  const link = /\[下载数据\]\((media\/[\w-]+\.csv)\)/.exec(markdown())?.[1]
  const escaped = /\[原始数据\]\((media\/[\w-]+%231\.csv)\)/.exec(markdown())?.[1]
  expect(image).toMatch(/^media\/[0-9a-f]{8}-dot\.svg$/)
  expect(link).toMatch(/^media\/[0-9a-f]{8}-data\.csv$/)
  expect(escaped).toMatch(/^media\/[0-9a-f]{8}-raw%231\.csv$/)
  const notebookDir = join(dir, 'out/notebook')
  expect(readFileSync(join(notebookDir, image!), 'utf8')).toBe(readFileSync(join(dir, 'figures/dot.svg'), 'utf8'))
  expect(readFileSync(join(notebookDir, link!), 'utf8')).toBe(readFileSync(join(dir, 'figures/data.csv'), 'utf8'))
  expect(readFileSync(join(notebookDir, decodeURIComponent(escaped!)), 'utf8')).toBe(readFileSync(join(dir, 'figures/raw#1.csv'), 'utf8'))
  // Only what the notebook shows is copied: not the preview image of the chart, whose fallback it shows.
  expect(readdirSync(join(notebookDir, 'media')).sort()).toEqual([image!, link!, decodeURIComponent(escaped!)].map(f => f.slice('media/'.length)).sort())
  // Remote URLs and URLs with malformed escapes are kept.
  expect(markdown()).toContain('(https://example.org/gauss)')
  expect(markdown()).toContain('![坏图](%E0%A4.png)')
})

it('writes MyST directives and roles as Markdown that Jupyter renders, and reports the nodes it has no form for', () => {
  expect(markdown()).not.toMatch(/:::\{|```\{|\{(sub|kbd|math)\}`/)
  expect(markdown()).toContain('> **Note**\n>\n> 提示写成带粗体标题的引用块。')
  expect(markdown()).toMatch(/\*\*价格表\*\*\n\n\| 名称 +\| 价格 +\|\n\| -+ \| -+ \|\n\| 苹果 +\| 3 +\|/)
  expect(markdown()).toContain('<details>\n<summary>点开看答案</summary>\n\n答案是 42。\n\n</details>')
  expect(markdown()).toContain('$$\nE = mc^2\n$$')
  expect(markdown()).toContain('![求和示意](https://example.org/sum.png)\n\n*求和的过程。*')
  expect(markdown()).toContain('水的化学式是 H<sub>2</sub>O，保存用 <kbd>Ctrl</kbd>。')
  // An embed has no Jupyter form: the build report lists it as degraded, at its source line.
  const line = readFileSync(join(dir, 'pages/myst.md'), 'utf8').split('\n').indexOf('```{embed} energy') + 1
  expect(build.stdout).toContain(`pages/myst.md:${line}  warning  myst#embed-1: degraded in the notebook, which has no Jupyter form for embed`)
  expect(build.stdout.match(/degraded in the notebook/g)).toHaveLength(1)
})

it('renders components through the plugin extension or the fallback, and reports the ones it cannot show', () => {
  const quiz = cells.findIndex(c => c.source.join('') === '**测验**：1 加到 10 等于多少？（[网页版](https://example.org/lecture/)）')
  expect(quiz).toBeGreaterThan(-1)
  expect(cells[quiz + 1]).toMatchObject({ cell_type: 'code', source: ['answer = None  # 在这里作答'] })
  expect(markdown()).toMatch(/\| 年份 +\| 数量 +\|\n.*\n\| 2024 \| 3 +\|/)
  const section = ir.sections.find(s => s.title === '组件')!.id
  expect(markdown()).toContain(`> 交互组件 \`FixtureCanvas\` 需要在[网页版](https://example.org/lecture/#${encodeURIComponent(section)})中查看。`)
  expect(build.stdout).toMatch(/notebook {2}out\/notebook {2}\(1 blocks not rendered\)/)
  expect(build.stdout).toContain(`${section}#fixture-canvas-1: component FixtureCanvas has no notebook extension or fallback`)
})
