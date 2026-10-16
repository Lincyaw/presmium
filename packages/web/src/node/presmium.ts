import type { PresmiumNodePlugin } from '@presmium/kernel'
import { WEB_ID } from '../domain/index.ts'
import { renderer } from './renderer.ts'

/** The web renderer plugin; the compiler loads it for the renderer id `web`. */
const plugin: PresmiumNodePlugin = { id: WEB_ID, version: '0.1.0', kernel: '^0.1.0', renderer }

export default plugin
