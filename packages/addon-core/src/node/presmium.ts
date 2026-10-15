import type { PresmiumNodePlugin } from '@presmium/kernel'

/** The host adapter adds no resolvers, checks or Markdown transforms. */
const plugin: PresmiumNodePlugin = { id: 'presmium.core' }

export default plugin
