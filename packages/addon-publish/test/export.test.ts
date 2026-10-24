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

async function exported(dir: string, ...args: string[]): Promise<Awaited<ReturnType<typeof bin>>> {
  const first = await bin('presmium-export', dir, ...args)
  return first.code === 2 && /Timeout|before the page showed/.test(first.stderr) ? bin('presmium-export', dir, ...args) : first
}

it('exports only the slides of a range', async () => {
  const dir = copyFixture('export')
  const { code, stdout, stderr } = await exported(dir, '--range', '1-3', '--output', 'part.pdf', '--json')
  expect(code, stderr).toBe(0)
  expect(JSON.parse(stdout)).toMatchObject({ format: 'pdf', pages: 3 })
  expect((await pdfLinks(join(dir, 'part.pdf'))).length).toBe(3)
}, 180_000)

async function pdfText(file: string): Promise<string[]> {
  const pdf = await getDocument({ data: new Uint8Array(readFileSync(file)) }).promise
  const pages: string[] = []
  for (let n = 1; n <= pdf.numPages; n++) {
    const { items } = await (await pdf.getPage(n)).getTextContent()
    pages.push(items.map(item => ('str' in item ? item.str : '')).join(' ').replace(/\s+/g, ' ').trim())
  }
  return pages
}
