import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { Compiler, DECK_ENTRY, prepare } from '@presmium/compiler'
import type { Compilation } from '@presmium/compiler'

/** Entry of the Slidev deck that the slides renderer writes to its work directory (docs/ir.md section 6). */
export const SLIDEV_ENTRY = 'slides.md'

export interface SlidesDeck {
  compilation: Compilation
  /** Directory of the Slidev deck generated from the IR. */
  dir: string
  /** Compile and render findings, as text. */
  warnings: string[]
}

/** Whether `dir` holds a deck the compiler reads. */
export function isDeck(dir: string): boolean {
  return existsSync(join(dir, DECK_ENTRY))
}

/** Whether the deck has the form of renderer `id`: it configures that renderer, or none (then every installed renderer runs). */
export function hasForm(compilation: Compilation, id: string): boolean {
  const { renderers } = compilation.doc.config
  return Object.keys(renderers).length === 0 || id in renderers
}

/**
 * Has the slides renderer write the Slidev deck of a compilation to its work
 * directory, without building it (`prepare`): `slidev export` serves the deck
 * itself, at the root whatever base the slides are built for, so the deck is
 * written for the root: the files it links and its components show are found
 * there. Throws when the renderer is missing or fails.
 */
export async function slidevDeck(compilation: Compilation): Promise<SlidesDeck> {
  // Nothing is written to the output directory.
  const report = await prepare(compilation, { outDir: join(compilation.deckDir, 'dist'), to: ['slides'], base: '/' })
  const warnings = report.findings.filter(f => f.severity !== 'info').map(f => f.message)
  const slides = report.outputs.find(o => o.renderer === 'slides')
  if (!slides) {
    throw new Error(report.findings.filter(f => f.checkId === 'presmium.render').map(f => f.message).join('; ') || 'the slides renderer did not run')
  }
  return { compilation, dir: slides.workDir, warnings }
}

/** Compiles the deck and writes its Slidev deck (`slidevDeck`). */
export async function slidesDeck(deckDir: string): Promise<SlidesDeck> {
  return slidevDeck(await new Compiler(deckDir).compile())
}
