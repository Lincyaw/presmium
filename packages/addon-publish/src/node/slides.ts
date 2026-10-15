import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { build, Compiler, DECK_ENTRY } from '@presmium/compiler'
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

/**
 * Compiles the deck and runs the slides renderer, which writes the Slidev
 * deck to its work directory; the renderer's own build output is discarded.
 * Throws when the renderer is missing or fails.
 */
export async function slidesDeck(deckDir: string): Promise<SlidesDeck> {
  const compilation = await new Compiler(deckDir).compile()
  const out = await mkdtemp(join(tmpdir(), 'presmium-publish-'))
  try {
    const report = await build(compilation, { outDir: out, to: ['slides'] })
    const warnings = report.findings.filter(f => f.severity !== 'info').map(f => f.message)
    const slides = report.outputs.find(o => o.renderer === 'slides')
    if (!slides) {
      throw new Error(report.findings.filter(f => f.checkId === 'presmium.render').map(f => f.message).join('; ') || 'the slides renderer did not run')
    }
    return { compilation, dir: slides.workDir, warnings }
  } finally {
    await rm(out, { recursive: true, force: true })
  }
}
