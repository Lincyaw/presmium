import { definePreparserSetup } from '@slidev/types'
import { DRAWINGS_DIR } from '../src/domain/index.ts'

/**
 * Turns on annotation persistence (P-04) for decks that use the stage, so drawings
 * are saved under DRAWINGS_DIR and shipped with builds and exports. Slidev reads
 * `drawings` only from the deck headmatter, and addons cannot set config defaults,
 * so the default is added to the headmatter as the deck is parsed. A deck that
 * configures `drawings` itself keeps its own settings.
 */
export default definePreparserSetup(({ headmatter }) => {
  if ('drawings' in headmatter) return []
  return [{
    name: 'presmium-stage-drawings',
    async transformSlide(_content, frontmatter) {
      // The headmatter is the first slide's frontmatter; it is the one that lists the addons.
      if ('addons' in frontmatter) frontmatter.drawings = { persist: DRAWINGS_DIR }
      return undefined
    },
  }]
})
