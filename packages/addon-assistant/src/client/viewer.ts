/**
 * The assistant in the web form's IR runtime: a question goes with the
 * current section and what the page shows of it (the document's IR, the
 * student build's on a student site), a citation of an answer moves the page
 * to its section and step (to the section's page in the document view), and
 * an annotation of a block (edit mode) goes with the block's source. The
 * slides form has no IR runtime; there a question goes with the current
 * page's text (./ask.ts).
 */
import { irBlocks } from '@presmium/kernel'
import type { ViewerPlugin } from '@presmium/viewer'
import { setNavigator } from './state.ts'

const plugin: ViewerPlugin = (ctx) => {
  setNavigator(() => {
    const viewer = ctx.useViewer()
    return {
      doc: () => viewer.doc.value,
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
