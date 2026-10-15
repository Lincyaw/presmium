import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { build, Compiler, DECK_ENTRY } from '@presmium/compiler'
import type { Compilation } from '@presmium/compiler'
import { SLIDEV_DIR } from '@presmium/render-slides/presmium'

/** The exports work on the Slidev deck that the slides renderer writes. */
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
 * deck to `<deck>/.presmium/slides`; the renderer's own build output is
 * discarded. Throws when the renderer is missing or fails.
 */
export async function slidesDeck(deckDir: string): Promise<SlidesDeck> {
  const compilation = await new Compiler(deckDir).compile()
  const out = await mkdtemp(join(tmpdir(), 'presmium-publish-'))
  try {
    const report = await build(compilation, { outDir: out, to: ['slides'] })
    const warnings = report.findings.filter(f => f.severity !== 'info').map(f => f.message)
    if (!report.outputs.some(o => o.renderer === 'slides')) {
      throw new Error(report.findings.filter(f => f.checkId === 'presmium.render').map(f => f.message).join('; ') || 'the slides renderer did not run')
    }
    return { compilation, dir: join(compilation.deckDir, SLIDEV_DIR), warnings }
  } finally {
    await rm(out, { recursive: true, force: true })
  }
}
