/**
 * The assistant in the web form's IR runtime: a citation of an answer moves
 * the page to its section and step (to the section's page in the document
 * view), a question goes with the current section, and an annotation of a
 * block (edit mode) with the block's source. The slides form has no IR
 * runtime; there citations are shown as text.
 */
import { irBlocks } from '@presmium/kernel'
import type { ViewerPlugin } from '@presmium/viewer'
import { setNavigator } from './state.ts'

const plugin: ViewerPlugin = (ctx) => {
  setNavigator(() => {
    const viewer = ctx.useViewer()
    return {
      position: () => viewer.position.value,
      title: section => viewer.section(section)?.title,
      show: citation => viewer.show({ section: citation.section, step: citation.step ?? 0 }),
      block: (section, block) => {
        const found = viewer.section(section)
        return found ? [...irBlocks(found.blocks)].find(b => b.id === block) : undefined
      },
      source: section => viewer.section(section)?.source,
    }
  })
}

export default plugin
