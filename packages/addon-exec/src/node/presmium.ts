import type { PresmiumNodePlugin } from '@presmium/kernel'

/** Execution runs in the browser; it adds no resolvers, checks or Markdown transforms. */
const plugin: PresmiumNodePlugin = { id: 'presmium.exec' }

export default plugin
