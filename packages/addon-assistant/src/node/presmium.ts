import { createRequire } from 'node:module'
import type { PresmiumNodePlugin } from '@lincyaw/kernel'
import { ASSISTANT_ID } from '../domain/index.ts'

const { version } = createRequire(import.meta.url)('../../package.json') as { version: string }

const plugin: PresmiumNodePlugin = {
  id: ASSISTANT_ID,
  version,
  kernel: '^1.0.0',
  operator: true,
}

export default plugin
