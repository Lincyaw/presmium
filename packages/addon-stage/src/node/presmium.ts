import { createRequire } from 'node:module'
import type { PresmiumNodePlugin } from '@presmium/kernel'
import { placeFootnotes, STAGE_ID } from '../domain/index.ts'

const { version } = createRequire(import.meta.url)('../../package.json') as { version: string }

/**
 * The stage relies on the renderers for content, notes and drawings. Its one
 * pass puts footnote definitions back next to their references (P-01).
 */
const plugin: PresmiumNodePlugin = {
  id: STAGE_ID,
  version,
  kernel: '^1.0.0',
  passes: [{ name: 'footnotes', run: doc => placeFootnotes(doc) }],
}

export default plugin
