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
