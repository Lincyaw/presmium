// Skipped until WP-45 moves the publish tools from the removed v1 CLI API (loadDeck, DECK_ENTRY) onto the IR pipeline; WP-45 must re-enable these.
// Runs the real `presmium-export` (`slidev export` to PDF, then the link check)
// on a copy of ./fixtures/deck.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, expect, it } from 'vitest'
import { pdfLinks } from '../src/node/pdf.ts'
import { bin, copyFixture, removeCopies } from './helpers.ts'

afterAll(removeCopies)

const PERMALINK = 'https://github.com/presmium/sample-repo/blob/3f2a9c1/src/math.py#L1-L2'

it.skip('exports a PDF in which the code permalink is still a link', async () => {
  const dir = copyFixture('deck')
  const { code, stdout, stderr } = await bin('presmium-export', dir, '--range', '1-2', '--output', 'out.pdf', '--json')
  expect(code, stderr).toBe(0)
  const result = JSON.parse(stdout)
  expect(result).toMatchObject({ lost: 0, links: [{ url: PERMALINK, slide: 1, pages: [1] }] })
  expect((await pdfLinks(join(dir, 'out.pdf')))[0]).toContain(PERMALINK)
}, 120_000)

it.skip('reports the links that the PDF lost, located in the deck source', async () => {
  const dir = copyFixture('deck')
  const { code, stdout, stderr } = await bin('presmium-export', dir)
  expect(code, stderr).toBe(1)
  expect(stdout).toContain('exported slides-export.pdf (3 pages)')
  const lines = readFileSync(join(dir, 'slides.md'), 'utf8').split('\n')
  for (const url of ['https://example.com/hidden', 'https://example.com/json-prop']) {
    const line = lines.findIndex(text => text.includes(url)) + 1
    expect(stdout).toContain(`slides.md:${line}  link lost  ${url} (slide 3)`)
  }
  expect(stdout).toContain('1 of 3 links kept')
}, 120_000)
