import type { PresmiumNodePlugin } from '@presmium/kernel'
import { placeFootnotes, STAGE_ID } from '../domain/index.ts'

/**
 * The stage relies on the renderers for content, notes and drawings. Its one
 * pass puts footnote definitions back next to their references (P-01).
 */
const plugin: PresmiumNodePlugin = {
  id: STAGE_ID,
  passes: [{ name: 'footnotes', run: doc => placeFootnotes(doc) }],
}

export default plugin
