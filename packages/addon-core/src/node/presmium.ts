import type { IRPass, PresmiumNodePlugin } from '@presmium/kernel'
import { SECTION_KEY } from '../domain/index.ts'

/**
 * Names each slide's section (D-4, F-85): a section's id goes to its
 * `hints.slides`, which the slides renderer writes to the slide's frontmatter,
 * where the slides form reads it (`presmiumId`). A build for an audience
 * runs its passes after the other audiences' sections are left out, so it
 * names only the sections it has.
 */
const slideSectionsPass: IRPass = {
  name: 'slide-sections',
  run(doc) {
    for (const section of doc.sections) section.hints.slides = { ...section.hints.slides, [SECTION_KEY]: section.id }
  },
}

/** The host adapter adds no resolvers, checks or Markdown transforms; its one pass names the slides' sections. */
const plugin: PresmiumNodePlugin = { id: 'presmium.core', version: '0.1.0', kernel: '^0.1.0', passes: [slideSectionsPass] }

export default plugin
