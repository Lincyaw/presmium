import { createRequire } from 'node:module'
import type { PresmiumNodePlugin } from '@presmium/kernel'
import { WEB_ID } from '../domain/index.ts'
import { renderer } from './renderer.ts'

const { version } = createRequire(import.meta.url)('../../package.json') as { version: string }

/** The web renderer plugin; the compiler loads it for the renderer id `web`. */
const plugin: PresmiumNodePlugin = { id: WEB_ID, version, kernel: '^1.0.0', renderer }

export default plugin
