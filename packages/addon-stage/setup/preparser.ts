import { basename, dirname, join, relative, sep } from 'node:path'
import { definePreparserSetup } from '@slidev/types'
import { DRAWINGS_DIR } from '../src/domain/index.ts'

/**
 * Turns on annotation persistence (P-04) for decks that use the stage, so drawings
 * are saved under DRAWINGS_DIR and shipped with builds and exports. Slidev reads
 * `drawings` only from the deck headmatter, and addons cannot set config defaults,
 * so the default is added to the headmatter as the deck is parsed. A deck that
 * configures `drawings` itself keeps its own settings.
 *
 * The slides renderer writes its Slidev deck under `<deck>/.presmium` (`slides`
 * for builds, `dev/slides` for `presmium dev`); the drawings of such a deck are
 * saved in the source deck, next to its sources, so they are committed with it.
 * The path is relative to the generated deck: no absolute path of the author's
 * machine reaches the build.
 */
export default definePreparserSetup(({ filepath, headmatter }) => {
  if ('drawings' in headmatter) return []
  const persist = drawingsDir(dirname(filepath))
  return [{
    name: 'presmium-stage-drawings',
    async transformSlide(_content, frontmatter) {
      // The headmatter is the first slide's frontmatter; it is the one that lists the addons.
      if ('addons' in frontmatter) frontmatter.drawings = { persist }
      return undefined
    },
  }]
})

/** DRAWINGS_DIR of the source deck that contains `dir` in its `.presmium` directory, else of `dir` itself. */
function drawingsDir(dir: string): string {
  for (let d = dir; dirname(d) !== d; d = dirname(d)) {
    if (basename(d) === '.presmium') return relative(dir, join(dirname(d), DRAWINGS_DIR)).split(sep).join('/')
  }
  return DRAWINGS_DIR
}
