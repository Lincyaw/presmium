/**
 * The assistant in the web form's IR runtime: a citation of an answer moves
 * the page to its section and step (to the section's page in the document
 * view), and a question goes with the current section. The slides form has
 * no IR runtime; there citations are shown as text.
 */
import type { ViewerPlugin } from '@presmium/viewer'
import { setNavigator } from './state.ts'

const plugin: ViewerPlugin = (ctx) => {
  setNavigator(() => {
    const viewer = ctx.useViewer()
    return {
      position: () => viewer.position.value,
      title: section => viewer.section(section)?.title,
      show: citation => viewer.show({ section: citation.section, step: citation.step ?? 0 }),
    }
  })
}

export default plugin
