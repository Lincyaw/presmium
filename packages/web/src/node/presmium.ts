import { createRequire } from 'node:module'
import type { PresmiumNodePlugin } from '@lincyaw/kernel'
import { WEB_ID } from '../domain/index.ts'
import { renderer } from './renderer.ts'

const { version } = createRequire(import.meta.url)('../../package.json') as { version: string }

const plugin: PresmiumNodePlugin = { id: WEB_ID, version, kernel: '^1.0.0', renderer }

export default plugin
