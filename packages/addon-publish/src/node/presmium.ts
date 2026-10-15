import type { PresmiumNodePlugin } from '@presmium/kernel'
import { PUBLISH_ID } from '../domain/index.ts'

/** Publishing adds no resolvers, checks or Markdown transforms; its tools are `presmium-export` and `presmium-diff`. */
const plugin: PresmiumNodePlugin = { id: PUBLISH_ID }

export default plugin
