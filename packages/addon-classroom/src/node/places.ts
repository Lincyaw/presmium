import type { IRPass } from '@presmium/kernel'
import { CLASSROOM_ID } from '../domain/index.ts'
import type { Place } from '../domain/index.ts'

/**
 * Gives every classroom component its place (section and block ids, section
 * title and number) as the prop `place`: block ids exist only after the
 * compiler has scheduled the steps. A question box's `:target:` must name a
 * block of its section.
 */
export const placesPass: IRPass = {
  name: 'classroom-places',
  run(doc, ctx) {
    for (const section of doc.sections) {
      for (const block of section.blocks) {
        const { node } = block
        if (node.type !== 'component' || node.plugin !== CLASSROOM_ID) continue
        node.props.place = { section: section.id, block: block.id, title: section.title, index: section.index } satisfies Place
        const { target } = node.props
        if (typeof target === 'string' && !section.blocks.some(b => b.id === target)) {
          ctx.report({
            checkId: 'presmium.classroom',
            severity: 'warning',
            message: `{question-box}: no block (${target})= in section ${section.id}; questions are attached to the section`,
            source: { file: block.source.file, line: block.source.line },
          })
          delete node.props.target
        }
      }
    }
  },
}
