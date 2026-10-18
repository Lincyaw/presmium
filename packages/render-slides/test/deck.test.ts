// The Slidev deck the slides renderer writes (WP-73a): its headmatter turns off Slidev's MCP endpoint,
// which would edit the generated deck (docs/architecture.md section 11), and the presenter's notes
// show the mark of a role without children where the slide shows only the roles' children (docs/ir.md 2.8).
// A plugin the compiler refuses (P-143) is no addon of the slides.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { presmium } from '@presmium/cli/testing'
import { expect, it } from 'vitest'
import { parse } from 'yaml'

const DECK = fileURLToPath(new URL('./fixtures/notes', import.meta.url))
const REFUSED = fileURLToPath(new URL('./fixtures/refused', import.meta.url))

it('writes mcp: false in the headmatter, and the marks of roles without children in the notes only', async () => {
  const { code, stdout, stderr } = await presmium(DECK, ['build', '--to', 'slides', '--out', 'dist'])
  expect(code, stdout + stderr).toBe(0)
  const slides = readFileSync(join(DECK, '.presmium/slides/slides.md'), 'utf8')
  const headmatter = parse(/^---\n([\s\S]*?)\n---/.exec(slides)![1]!) as Record<string, unknown>
  expect(headmatter.mcp).toBe(false)
  // A build has no Presmium server.
  expect(headmatter.presmiumServer).toBeUndefined()

  const notes = /<!--\n([\s\S]*?)\n-->/.exec(slides)![1]!
  expect(notes).toBe('讲解中的提示 〔probe hidden〕 与 **可见的讲解**。')
  const body = slides.slice(0, slides.indexOf('<!--'))
  expect(body).toContain('**可见的内容**')
  expect(body).not.toContain('〔probe')
}, 300_000)

it('leaves a plugin the compiler refuses out of the slides\' addons, and builds them (P-143)', async () => {
  const { code, stdout, stderr } = await presmium(REFUSED, ['build', '--to', 'slides', '--out', 'dist'])
  expect(code).toBe(1)
  expect(stdout + stderr).toContain('plugin "./future" (fixture.slides-future 2.0.0) is not loaded: kernel 1.0.0 does not satisfy "^9.0.0"')
  const slides = readFileSync(join(REFUSED, '.presmium/slides/slides.md'), 'utf8')
  const headmatter = parse(/^---\n([\s\S]*?)\n---/.exec(slides)![1]!) as { addons?: string[] }
  expect(headmatter.addons?.some(addon => addon.includes('future'))).toBe(false)
  expect(existsSync(join(REFUSED, 'dist/slides/index.html'))).toBe(true)
}, 300_000)
