import { useStore } from '@lincyaw/host'
import type { ViewerPlugin } from '@lincyaw/viewer'
import { setWebViewerAccess } from './state.ts'

const plugin: ViewerPlugin = (ctx) => {
  setWebViewerAccess(() => {
    const viewer = ctx.useViewer()
    useStore(viewer.doc)
    useStore(viewer.position)
    return {
      doc: () => viewer.doc.getSnapshot(),
      position: () => viewer.position.getSnapshot(),
      title: section => viewer.section(section)?.title,
      show: citation => viewer.show({ section: citation.section, step: citation.step ?? 0 }),
    }
  })
}

export default plugin
