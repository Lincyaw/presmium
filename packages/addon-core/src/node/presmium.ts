import type { PresmiumNodePlugin } from '@presmium/kernel'

/** The host adapter adds no resolvers, checks or Markdown transforms. */
const plugin: PresmiumNodePlugin = { id: 'presmium.core', version: '0.1.0', kernel: '^0.1.0' }

export default plugin
