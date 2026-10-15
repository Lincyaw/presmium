import type { PresmiumNodePlugin } from '@presmium/kernel'
import { GUIDE_ID } from '../domain/index.ts'

/** Cues are plain components: no resolvers, checks or Markdown transforms. */
const plugin: PresmiumNodePlugin = { id: GUIDE_ID }

export default plugin
