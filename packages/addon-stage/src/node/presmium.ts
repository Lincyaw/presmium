import type { PresmiumNodePlugin } from '@presmium/kernel'
import { STAGE_ID } from '../domain/index.ts'

/** The stage relies on the host for content, notes and drawings; it adds no resolvers, checks or transforms. */
const plugin: PresmiumNodePlugin = { id: STAGE_ID }

export default plugin
