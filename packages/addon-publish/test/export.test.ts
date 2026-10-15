// Runs the real `presmium-export` (compiler, slides renderer, `slidev export` to
// PDF, then the link check) on a git repository holding a copy of ./fixtures/deck,
// whose first slide shows math.py through {code-ref}: the permalink is generated.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, expect, it } from 'vitest'
import { pdfLinks } from '../src/node/pdf.ts'
import { bin, git, removeCopies, repository } from './helpers.ts'

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
