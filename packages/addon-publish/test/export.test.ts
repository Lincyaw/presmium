// Runs the real `presmium-export` (compiler, slides renderer, `slidev export` to
// PDF, then the link check, or to PNG) on a git repository holding a copy of
// ./fixtures/deck, whose first slide shows math.py through {code-ref}: the
// permalink is generated; on ./fixtures/export, four slides, the second with
// a click, the third a quiz, which an export shows in its static form; the deck sets a base for its slides;
// and on ./fixtures/late, two slides, the second with a click, whose test plugin's Slidev app setup
// holds the app back for ten seconds: the print page has loaded, idle, and shows no slide yet; and on
// ./fixtures/tall, a zoomed slide of code that also runs live, a slide taller than the page, two more and a
// run panel taller than its slide.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, expect, it } from 'vitest'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { pdfLinks } from '../src/node/pdf.ts'
import { bin, copyFixture, git, removeCopies, repository } from './helpers.ts'

afterAll(removeCopies)

it('exports one page per click step, and the generated code permalink is a link on every step of its slide', async () => {
  const dir = repository('deck')
  const permalink = new RegExp(`^https://github\\.com/presmium/publish-fixture/blob/${git(dir, 'rev-parse', 'HEAD')}/math\\.py#L\\d+-L\\d+$`)
  const { code, stdout, stderr } = await bin('presmium-export', dir, '--with-clicks', '--range', '1-2', '--output', 'out.pdf', '--json')
  expect(code, stderr).toBe(0)
  const result = JSON.parse(stdout)
  // Slide 1 steps through two units of the code: its two pages, and only they, link to the code.
  expect(result).toMatchObject({ lost: 0, links: [{ slide: 1, pages: [1, 2] }] })
  expect(result.links[0].url).toMatch(permalink)
  const pages = await pdfLinks(join(dir, 'out.pdf'))
  expect(pages.length).toBeGreaterThan(2)
  expect(pages.map(uris => uris.includes(result.links[0].url))).toEqual(pages.map((_, i) => i < 2))
}, 180_000)

it('reports the links that the PDF lost, located in the deck source', async () => {
  const dir = repository('deck')
  const { code, stdout, stderr } = await bin('presmium-export', dir)
  expect(code, stderr).toBe(1)
  expect(stdout).toContain('exported slides-export.pdf (3 pages)')
  const lines = readFileSync(join(dir, 'lecture.md'), 'utf8').split('\n')
  for (const url of ['https://example.com/hidden', 'https://example.com/json-prop']) {
    const line = lines.findIndex(text => text.includes(url)) + 1
    expect(stdout).toContain(`lecture.md:${line}  link lost  ${url} (slide 3)`)
  }
  expect(stdout).toContain('1 of 3 links kept')
}, 180_000)

it('exports PNG images, one per click step, the slide of a component in its static form included (P-50)', async () => {
  const dir = copyFixture('export')
  const { code, stdout, stderr } = await bin('presmium-export', dir, '--format', 'png', '--with-clicks', '--output', 'pages', '--json')
  expect(code, stderr).toBe(0)
  expect(JSON.parse(stdout)).toMatchObject({ format: 'png', pages: 5, links: [] })
  expect(readdirSync(join(dir, 'pages')).sort()).toEqual(['001-01.png', '002-01.png', '002-02.png', '003-01.png', '004-01.png'])
  // The deck sets a base, but \`slidev export\` serves the Slidev deck at the root: the deck is written for it.
  expect(readFileSync(join(dir, '.presmium/slides/slides.md'), 'utf8')).toMatch(/<a href="\/[0-9a-f]{8}-notes\.txt" target="_blank" rel="noopener">the notes<\/a>/)
}, 180_000)

it('exports only the slides of a range', async () => {
  const dir = copyFixture('export')
  const { code, stdout, stderr } = await bin('presmium-export', dir, '--range', '1-3', '--output', 'part.pdf', '--json')
  expect(code, stderr).toBe(0)
  expect(JSON.parse(stdout)).toMatchObject({ format: 'pdf', pages: 3 })
  expect((await pdfLinks(join(dir, 'part.pdf'))).length).toBe(3)
}, 180_000)

it('fails, rather than pass for the slides, when slidev export captures the print page before it shows them; --wait lets the page settle (P-50)', async () => {
  const dir = copyFixture('late')
  // `slidev export` itself exits 0 here, with no image.
  const early = await bin('presmium-export', dir, '--format', 'png', '--with-clicks', '--output', 'pages', '--json')
  expect(early.code, early.stderr).toBe(2)
  expect(early.stdout).toBe('')
  expect(early.stderr).toContain('presmium-export: slidev export wrote 0 images, none of slide 1, 2 of the 2 slides exported: it captured the print page before the page showed every slide')
  expect(early.stderr).toContain('let the page settle longer than 1000 ms with --wait <ms>')

  const settled = await bin('presmium-export', dir, '--format', 'png', '--with-clicks', '--output', 'pages', '--wait', '20000', '--json')
  expect(settled.code, settled.stderr).toBe(0)
  expect(JSON.parse(settled.stdout)).toMatchObject({ format: 'png', pages: 3 })
  expect(readdirSync(join(dir, 'pages')).sort()).toEqual(['001-01.png', '002-01.png', '002-02.png'])
}, 180_000)

it('fails when the PDF does not have the pages of the range, rather than pass for them with other pages (F-18)', async () => {
  const dir = copyFixture('late')
  // Captured before the app shows a slide, the PDF has one blank page: the range's slide has two, with its click.
  const exportRange = () => bin('presmium-export', dir, '--with-clicks', '--range', '2', '--output', 'part.pdf', '--json')
  let result = await exportRange()
  // On a busy machine `slidev export` may outlast its own wait for the page while Vite optimizes the
  // deck's dependencies (it says Timeout, before any PDF); once more, with them optimized, is the remedy.
  if (/Timeout/.test(result.stderr) && !result.stderr.includes('cannot be cut to the range')) result = await exportRange()
  const { code, stdout, stderr } = result
  expect(code, stderr).toBe(2)
  expect(stdout).toBe('')
  expect(stderr).toContain('presmium-export: the PDF has 1 pages where the range has 2 (3 for the whole deck); it cannot be cut to the range')
}, 180_000)

/** The text of each page of a PDF. */
async function pdfText(file: string): Promise<string[]> {
  const pdf = await getDocument({ data: new Uint8Array(readFileSync(file)) }).promise
  const pages: string[] = []
  for (let n = 1; n <= pdf.numPages; n++) {
    const { items } = await (await pdf.getPage(n)).getTextContent()
    pages.push(items.map(item => ('str' in item ? item.str : '')).join(' ').replace(/\s+/g, ' ').trim())
  }
  return pages
}

it('exports a page per slide: code that runs live is static code with its recorded output, once; a slide taller than its page is cut, not the others shrunk, and a run panel\'s keeps its output; a range exports its slides only (F-18, F-19)', async () => {
  const dir = copyFixture('tall')
  let whole = await bin('presmium-export', dir, '--output', 'tall.pdf', '--json')
  // A deck's first export may find Vite still optimizing the execution plugin's dependencies, and a busy
  // machine then outlasts the print page's wait; the export fails saying so (exit 2), and once more is the remedy.
  if (whole.code === 2 && /Timeout|before the page showed/.test(whole.stderr)) whole = await bin('presmium-export', dir, '--output', 'tall.pdf', '--json')
  expect(whole.code, whole.stderr).toBe(0)
  expect(JSON.parse(whole.stdout)).toMatchObject({ pages: 5 })
  // The export's deck writes the code as an export shows it: no Monaco runner.
  expect(readFileSync(join(dir, '.presmium/slides/slides.md'), 'utf8')).not.toContain('{monaco-run}')
  const [tall, overflow, one, two, panel] = await pdfText(join(dir, 'tall.pdf'))
  expect(tall!.match(/TALL-OUTPUT 42/g)).toHaveLength(1)
  expect(tall).not.toContain('Click the play button')
  expect(overflow).toContain('A block much taller than the slide.')
  // What does not fit the overflowing slide is cut there: it runs on into no other page.
  expect(one).toBe('After one')
  expect(two).toBe('After two')
  // A run panel's code longer than its slide gives way to the output recorded for it.
  expect(panel).toContain('PANEL-OUTPUT 42')

  const part = await bin('presmium-export', dir, '--range', '3-4', '--output', 'part.pdf', '--json')
  expect(part.code, part.stderr).toBe(0)
  expect(await pdfText(join(dir, 'part.pdf'))).toEqual(['After one', 'After two'])
}, 240_000)
