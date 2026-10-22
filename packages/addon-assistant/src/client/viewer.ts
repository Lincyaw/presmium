import type { ViewerPlugin } from '@lincyaw/viewer'
import { setWebViewerAccess } from './state.ts'

const plugin: ViewerPlugin = (ctx) => {
  setWebViewerAccess(() => {
    const viewer = ctx.useViewer()
    return {
      doc: () => viewer.doc.value,
      position: () => viewer.position.value,
      title: section => viewer.section(section)?.title,
      show: citation => viewer.show({ section: citation.section, step: citation.step ?? 0 }),
    }
  })
}

export default plugin
