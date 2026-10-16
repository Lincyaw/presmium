// Runs the real `presmium-export` (compiler, slides renderer, `slidev export` to
// PDF, then the link check, or to PNG) on a git repository holding a copy of
// ./fixtures/deck, whose first slide shows math.py through {code-ref}: the
// permalink is generated; on ./fixtures/export, four slides, the second with
// a click, the third a quiz, which an export shows in its static form; the deck sets a base for its slides;
// and on ./fixtures/late, two slides, the second with a click, whose test plugin's Slidev app setup
// holds the app back for ten seconds: the print page has loaded, idle, and shows no slide yet.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, expect, it } from 'vitest'
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
