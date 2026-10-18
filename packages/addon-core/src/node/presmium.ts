import { createRequire } from 'node:module'
import type { IRPass, PresmiumNodePlugin } from '@presmium/kernel'
import { backSection, stepKeys } from '@presmium/viewer/domain'
import { BACK_KEY, SECTION_KEY, STEPS_KEY } from '../domain/index.ts'

const { version } = createRequire(import.meta.url)('../../package.json') as { version: string }

const SLIDES = 'slides'

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

const plugin: PresmiumNodePlugin = { id: 'presmium.core', version, kernel: '^1.0.0', passes: [slideSectionsPass] }

export default plugin
