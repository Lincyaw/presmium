import type { ViewerPlugin } from '@presmium/viewer'
import { setViewerAccess } from './preview.ts'

const plugin: ViewerPlugin = (ctx) => {
  setViewerAccess(() => ctx.useViewer())
}

export default plugin
