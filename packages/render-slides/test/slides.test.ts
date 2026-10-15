// `presmium build --to slides` on a real deck, then `slidev export` on the Slidev deck it leaves (WP-41).
// The fixture deck stays in place (its .presmium/ is ignored) so the generated deck resolves
// Slidev, its theme and playwright-chromium from this package's node_modules.
import { execFile } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PDFDocument } from 'pdf-lib'
import { afterAll, expect, it } from 'vitest'

const DECK = fileURLToPath(new URL('./fixtures/deck', import.meta.url))
const PRESMIUM = fileURLToPath(new URL('../node_modules/@presmium/cli/bin/presmium.mjs', import.meta.url))
const require = createRequire(import.meta.url)
const SLIDEV = join(dirname(require.resolve('@slidev/cli/package.json')), 'bin/slidev.mjs')

const out = mkdtempSync(join(tmpdir(), 'presmium-slides-'))
afterAll(() => rmSync(out, { recursive: true, force: true }))

function run(bin: string, args: string[]): Promise<{ code: number, output: string }> {
  return new Promise((resolve) => {
    execFile(process.execPath, [bin, ...args], { cwd: DECK, maxBuffer: 16 << 20 }, (error, stdout, stderr) => {
      resolve({ code: error ? Number(error.code) : 0, output: stdout + stderr })
    })
  })
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
