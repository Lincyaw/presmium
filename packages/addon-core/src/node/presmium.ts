import { createRequire } from 'node:module'
import type { IRPass, PresmiumNodePlugin } from '@presmium/kernel'
import { backSection, stepKeys } from '@presmium/viewer/domain'
import { BACK_KEY, SECTION_KEY, STEPS_KEY } from '../domain/index.ts'

const { version } = createRequire(import.meta.url)('../../package.json') as { version: string }

/** The slides form's renderer, whose view of a section gives its slide's clicks. */
const SLIDES = 'slides'

/**
 * Names each slide's place by ids (D-4, F-85): a section's id, the keys of
 * its steps in the slides form's view (when it has steps) and, for a section
 * only some audiences have, the section to go back to go to its
 * `hints.slides`, which the slides renderer writes to the slide's
 * frontmatter, where the slides form reads them (`presmiumId`,
 * `presmiumSteps`, `presmiumBack`). A build for an audience runs its passes
 * after the other audiences' content is left out, so it names only what it
 * has, in its own steps.
 */
const slideSectionsPass: IRPass = {
  name: 'slide-sections',
  run(doc) {
    for (const section of doc.sections) {
      const steps = stepKeys(section, SLIDES)
      const back = backSection(doc.sections, section.id)
      section.hints.slides = {
        ...section.hints.slides,
        [SECTION_KEY]: section.id,
        ...steps.length > 1 ? { [STEPS_KEY]: steps } : {},
        ...back ? { [BACK_KEY]: back } : {},
      }
    }
  },
}

/** The host adapter adds no resolvers, checks or Markdown transforms; its one pass names the slides' places. */
const plugin: PresmiumNodePlugin = { id: 'presmium.core', version, kernel: '^1.0.0', passes: [slideSectionsPass] }

export default plugin
