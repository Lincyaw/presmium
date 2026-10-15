// Test decks of the exec group's specs: built with the real `presmium build` and served
// on free ports. A deck is written inside examples/demo/.presmium (ignored by git), so
// its plugins, Slidev and VitePress resolve from the demo's node_modules.
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { presmium } from '../deck.ts'

export { serve } from '../deck.ts'

const ROOT = fileURLToPath(new URL('../../..', import.meta.url))

export interface BuiltDeck {
  dir: string
  /** Slide number of each section id, from the built IR. */
  slides: Record<string, number>
  remove(): void
}

/** Writes the deck of the fixture directory `e2e/fixtures/exec/<name>`. */
export const fixture = (name: string) => (dir: string) => cpSync(fileURLToPath(new URL(name, import.meta.url)), dir, { recursive: true })

/** A new deck written by `write`, built for the renderers `to` into `<dir>/dist`. */
export async function buildDeck(prefix: string, write: (dir: string) => void, to = ['web', 'slides']): Promise<BuiltDeck> {
  const work = join(ROOT, 'examples/demo/.presmium')
  mkdirSync(work, { recursive: true })
  const dir = mkdtempSync(join(work, `e2e-${prefix}-`))
  const remove = () => rmSync(dir, { recursive: true, force: true })
  try {
    write(dir)
    await presmium(['build', '--to', to.join(',')], dir)
  } catch (error) {
    remove()
    throw error
  }
  const ir = JSON.parse(readFileSync(join(dir, 'dist/ir.json'), 'utf8')) as { sections: { id: string, index: number }[] }
  return { dir, slides: Object.fromEntries(ir.sections.map(s => [s.id, s.index])), remove }
}
