import { createRequire } from 'node:module'
import type { PresmiumNodePlugin } from '@lincyaw/kernel'
import { GUIDE_ID } from '../domain/index.ts'

const { version } = createRequire(import.meta.url)('../../package.json') as { version: string }

const plugin: PresmiumNodePlugin = { id: GUIDE_ID, version, kernel: '^1.0.0' }

export default plugin
