/**
 * The workspace in the web form's IR runtime: the source editor reaches the
 * page's viewer (the document's IR with its source positions and the
 * compilation's problems, and showing a place), so the preview and the
 * source follow each other in edit mode (./preview.ts).
 */
import type { ViewerPlugin } from '@presmium/viewer'
import { setViewerAccess } from './preview.ts'

const plugin: ViewerPlugin = (ctx) => {
  setViewerAccess(() => ctx.useViewer())
}

export default plugin
