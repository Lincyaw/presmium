// The Slidev deck the slides renderer writes (WP-73a): its headmatter turns off Slidev's MCP endpoint,
// which would edit the generated deck (docs/architecture.md section 11), and the presenter's notes
// show the mark of a role without children where the slide shows only the roles' children (docs/ir.md 2.8).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { presmium } from '@presmium/cli/testing'
import { expect, it } from 'vitest'
import { parse } from 'yaml'

const DECK = fileURLToPath(new URL('./fixtures/notes', import.meta.url))

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
