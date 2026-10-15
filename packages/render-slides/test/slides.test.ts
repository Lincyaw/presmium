// `presmium build --to slides` on a real deck, then `slidev export` on the Slidev deck it leaves (WP-41).
// The fixture decks stay in place (their .presmium/ is ignored) so the generated deck resolves
// Slidev, its theme and playwright-chromium from this package's node_modules.
import { execFile } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PDFDocument } from 'pdf-lib'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { afterAll, expect, it } from 'vitest'

const DECK = fileURLToPath(new URL('./fixtures/deck', import.meta.url))
const EXPORT_DECK = fileURLToPath(new URL('./fixtures/export', import.meta.url))
const PRESMIUM = fileURLToPath(new URL('../node_modules/@presmium/cli/bin/presmium.mjs', import.meta.url))
const require = createRequire(import.meta.url)
const SLIDEV = join(dirname(require.resolve('@slidev/cli/package.json')), 'bin/slidev.mjs')

const out = mkdtempSync(join(tmpdir(), 'presmium-slides-'))
afterAll(() => rmSync(out, { recursive: true, force: true }))

function run(bin: string, args: string[], cwd = DECK): Promise<{ code: number, output: string }> {
  return new Promise((resolve) => {
    execFile(process.execPath, [bin, ...args], { cwd, maxBuffer: 16 << 20 }, (error, stdout, stderr) => {
      resolve({ code: error ? Number(error.code) : 0, output: stdout + stderr })
    })
  })
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
  const built = await run(PRESMIUM, ['build', '--to', 'slides', '--out', out])
  expect(built.code, built.output).toBe(0)
  expect(existsSync(join(out, 'slides/index.html'))).toBe(true)
  // The deck's public/ directory is served with the slides.
  expect(existsSync(join(out, 'slides/dot.svg'))).toBe(true)
  expect(built.output).toContain('slidev export .presmium/slides/slides.md')

  const pdf = join(out, 'deck.pdf')
  const exported = await run(SLIDEV, ['export', '.presmium/slides/slides.md', '--with-clicks', '--output', pdf])
  expect(exported.code, exported.output).toBe(0)
  // Every step of every section is a page: list items, a revealed block, highlight stages, code versions.
  const { sections } = JSON.parse(readFileSync(join(out, 'ir.json'), 'utf8')) as { sections: { steps: number }[] }
  expect(sections.map(s => s.steps)).toEqual([0, 3, 3, 0])
  expect((await PDFDocument.load(readFileSync(pdf))).getPageCount()).toBe(10)
}, 180_000)

it('a PDF export shows the static fallback of interactive components, not their controls or run-time state', async () => {
  const target = join(out, 'export')
  const built = await run(PRESMIUM, ['build', '--to', 'slides', '--out', target], EXPORT_DECK)
  expect(built.code, built.output).toBe(0)
  const pdf = join(target, 'export.pdf')
  // The slides of plugin components load late on a busy machine; the export waits for them (Slidev's `--wait`).
  const exported = await run(SLIDEV, ['export', '.presmium/slides/slides.md', '--wait', '2000', '--output', pdf], EXPORT_DECK)
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
