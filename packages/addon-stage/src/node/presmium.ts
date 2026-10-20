import { createRequire } from 'node:module'
import type { PresmiumNodePlugin } from '@lincyaw/kernel'
import { placeFootnotes, STAGE_ID } from '../domain/index.ts'

const { version } = createRequire(import.meta.url)('../../package.json') as { version: string }

const plugin: PresmiumNodePlugin = {
  id: STAGE_ID,
  version,
  kernel: '^1.0.0',
  passes: [{ name: 'footnotes', run: doc => placeFootnotes(doc) }],
}

export default plugin
