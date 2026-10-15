import { basename, dirname, join } from 'node:path'
import { definePreparserSetup } from '@slidev/types'
import { DRAWINGS_DIR } from '../src/domain/index.ts'

/**
 * Turns on annotation persistence (P-04) for decks that use the stage, so drawings
 * are saved under DRAWINGS_DIR and shipped with builds and exports. Slidev reads
 * `drawings` only from the deck headmatter, and addons cannot set config defaults,
 * so the default is added to the headmatter as the deck is parsed. A deck that
 * configures `drawings` itself keeps its own settings.
 *
 * The slides renderer writes its Slidev deck to `<deck>/.presmium/slides`; the
 * drawings of such a deck are saved in the source deck, next to its sources.
 */
export default definePreparserSetup(({ filepath, headmatter }) => {
  if ('drawings' in headmatter) return []
  const dir = dirname(filepath)
  const persist = basename(dirname(dir)) === '.presmium' ? join(dirname(dirname(dir)), DRAWINGS_DIR) : DRAWINGS_DIR
  return [{
    name: 'presmium-stage-drawings',
    async transformSlide(_content, frontmatter) {
      // The headmatter is the first slide's frontmatter; it is the one that lists the addons.
      if ('addons' in frontmatter) frontmatter.drawings = { persist }
      return undefined
    },
  }]
})
