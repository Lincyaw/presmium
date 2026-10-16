// `presmium build --to slides` on real decks, then `slidev export` on the Slidev deck it leaves (WP-41).
// The fixture decks stay in place (their .presmium/ is ignored) so the generated deck resolves
// Slidev, its theme and playwright-chromium from this package's node_modules.
import { existsSync, lstatSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { presmium, run } from '@presmium/cli/testing'
import { PDFDocument } from 'pdf-lib'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { afterAll, expect, it } from 'vitest'

const DECK = fileURLToPath(new URL('./fixtures/deck', import.meta.url))
const EXPORT_DECK = fileURLToPath(new URL('./fixtures/export', import.meta.url))
const MYST_DECK = fileURLToPath(new URL('./fixtures/myst', import.meta.url))
const require = createRequire(import.meta.url)
const SLIDEV = join(dirname(require.resolve('@slidev/cli/package.json')), 'bin/slidev.mjs')

const out = mkdtempSync(join(tmpdir(), 'presmium-slides-'))
afterAll(() => rmSync(out, { recursive: true, force: true }))

/** `presmium <args>` in a fixture deck; the output, both streams. */
async function build(args: string[], cwd = DECK): Promise<{ code: number, output: string }> {
  const { code, stdout, stderr } = await presmium(cwd, args)
  return { code, output: stdout + stderr }
}

/** `slidev <args>` in a fixture deck. */
async function slidev(args: string[], cwd = DECK): Promise<{ code: number, output: string }> {
  const { code, stdout, stderr } = await run(process.execPath, [SLIDEV, ...args], { cwd })
  return { code, output: stdout + stderr }
}

/** NFKC: fonts in PDFs often map CJK characters to compatibility code points (a radical for 示). */
const normal = (text: string) => text.normalize('NFKC')

/** The text of each page of a PDF, normalized. */
async function pdfText(file: string): Promise<string[]> {
  const pdf = await getDocument({ data: new Uint8Array(readFileSync(file)) }).promise
  const pages: string[] = []
  for (let n = 1; n <= pdf.numPages; n++) {
    const { items } = await (await pdf.getPage(n)).getTextContent()
    pages.push(normal(items.map(item => 'str' in item ? item.str : '').join('')))
  }
  return pages
}

it('build --to slides leaves a Slidev deck that slidev export turns into a PDF with a page per step', async () => {
  const built = await build(['build', '--to', 'slides', '--out', out])
  expect(built.code, built.output).toBe(0)
  expect(existsSync(join(out, 'slides/index.html'))).toBe(true)
  // The deck's public/ directory is served with the slides: linked entry by entry, never written to.
  expect(existsSync(join(out, 'slides/dot.svg'))).toBe(true)
  expect(lstatSync(join(DECK, '.presmium/slides/public/dot.svg')).isSymbolicLink()).toBe(true)
  expect(built.output).toContain('slidev export .presmium/slides/slides.md')
  // The origin bar of code in versions links the file at the lines of the version on screen (C-10).
  const slides = readFileSync(join(DECK, '.presmium/slides/slides.md'), 'utf8')
  const shown = 'Math.min(Math.max($clicks - 2, 0), 1)'
  expect(slides).toContain(`href="https://example.org/v1/sum.py#L1" target="_blank" rel="noopener" title="在仓库中打开 sum.py" v-show="${shown} === 0">sum.py:1</a>`)
  expect(slides).toContain(`href="https://example.org/v2/sum.py#L2" target="_blank" rel="noopener" title="在仓库中打开 sum.py" v-show="${shown} === 1">sum.py:2</a>`)

  const pdf = join(out, 'deck.pdf')
  const exported = await slidev(['export', '.presmium/slides/slides.md', '--with-clicks', '--output', pdf])
  expect(exported.code, exported.output).toBe(0)
  // Every step of every section is a page: list items, a revealed block, highlight stages, code versions.
  const { sections } = JSON.parse(readFileSync(join(out, 'ir.json'), 'utf8')) as { sections: { steps: number }[] }
  expect(sections.map(s => s.steps)).toEqual([0, 3, 3, 0])
  expect((await PDFDocument.load(readFileSync(pdf))).getPageCount()).toBe(10)
}, 180_000)

it('a PDF export shows the static fallback of interactive components, not their controls or run-time state', async () => {
  const target = join(out, 'export')
  const built = await build(['build', '--to', 'slides', '--out', target], EXPORT_DECK)
  expect(built.code, built.output).toBe(0)
  const pdf = join(target, 'export.pdf')
  // The slides of plugin components load late on a busy machine; the export waits for them (Slidev's `--wait`).
  const exported = await slidev(['export', '.presmium/slides/slides.md', '--wait', '2000', '--output', pdf], EXPORT_DECK)
  expect(exported.code, exported.output).toBe(0)

  const [, panel, local, quiz] = await pdfText(pdf)
  // The run panel and the local environment: their code, without run buttons or a missing dev server.
  expect(panel).toContain('print("panel fallback")')
  expect(local).toContain('print("local fallback")')
  // The quiz: its question and options, without a submit button.
  expect(quiz).toContain(normal('导出的测验显示什么？'))
  expect(quiz).toContain(normal('题目与选项'))
  for (const text of [panel, local, quiz]) {
    for (const live of ['运行', '提交', '开发服务器', '执行服务不可用']) expect(text).not.toContain(normal(live))
  }
}, 180_000)

it('writes MyST as Slidev reads it, publishes the local files the slides show and isolates each plugin component', async () => {
  const target = join(out, 'myst')
  const built = await build(['build', '--to', 'slides,notebook', '--out', target], MYST_DECK)
  expect(built.code, built.output).toBe(0)
  const slides = readFileSync(join(MYST_DECK, '.presmium/slides/slides.md'), 'utf8')
  const notebook = (JSON.parse(readFileSync(join(target, 'notebook/lecture.ipynb'), 'utf8')) as { cells: { source: string[] }[] }).cells.map(c => c.source.join('')).join('\n\n')

  // The web-only block takes no step of the slides: the code that follows it shows at the first click (R-03).
  expect(slides).toContain('# Only\n\n<div v-click="1">\n\n```python\nprint("after")')

  // MyST lowered as the notebook lowers it (R-07): the figure's caption a paragraph of its own, the dropdown
  // a <details>, the definition list a list; links to labels go to their slides through Slidev's <Link>.
  expect(slides).toContain('![](/e385aa54-dot.svg)\n\n*A dot.*')
  expect(slides).toContain('<details>\n<summary>Open me</summary>\n\nHidden body.\n\n</details>')
  expect(slides).toContain('- **Term**\n\n  Definition of the term.')
  expect(slides).toContain('See <Link to="2">the first section</Link> and <Link to="3">Figure\u00A01</Link>.')
  expect(slides).toContain('<iframe src="https://example.org/embed" width="80%" loading="lazy"></iframe>')

  // Local files of an included page, and the file a component names, are published at the root of the
  // slides under their content hash (R-06); a URL with a malformed escape stays as it is.
  expect(slides).toContain('![A dot](/e385aa54-dot.svg) [The handout](/003d456f-handout.pdf) [A broken link](%E0%A4.pdf)')
  expect(slides).toContain('<FixtureClip src="/7cb92485-clip.webm" />')
  for (const file of ['e385aa54-dot.svg', '003d456f-handout.pdf', '7cb92485-clip.webm']) expect(existsSync(join(target, 'slides', file)), file).toBe(true)
  expect(notebook).toContain('![A dot](media/e385aa54-dot.svg) [The handout](media/003d456f-handout.pdf)')

  // Each plugin component is isolated (K-07); an extension that throws leaves the component and a warning
  // at its block (R-33); code that a component holds shows no recorded output (C-5).
  const line = readFileSync(join(MYST_DECK, 'lecture.md'), 'utf8').split('\n').indexOf(':::{boom}') + 1
  expect(built.output).toContain(`lecture.md:${line}  warning  the slides extension of FixtureBoom (plugin fixture.widgets) failed: the extension broke`)
  expect(slides).toContain('<PmBoundary name="FixtureBoom">\n\n<PmStaticFallback>\n\n<FixtureBoom />')
  expect(slides).toContain('<PmBoundary name="FixturePanel">\n\n<FixturePanel>\n\n```text\nowned by the panel\n```\n\n</FixturePanel>')
  expect(slides).not.toContain('OWNED BY THE PANEL')

  // Two plugins render a component of the same name: both renderers pick the plugin the node names (R-42).
  expect(slides).toContain('<PmBoundary name="FixtureTwin">\n\n<p>twin from twin</p>')
  expect(notebook).toContain('twin from twin')
  expect(`${slides}${notebook}`).not.toContain('twin from widgets')
  // An overlay with nothing to show in exports is not wrapped for them (C-15).
  expect(slides).toContain('<PmBoundary name="FixturePointer">\n\n<FixturePointer />\n\n</PmBoundary>')

}, 180_000)
