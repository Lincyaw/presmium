import type { PresmiumNodePlugin } from '@presmium/kernel'
import { CONTENT_ID } from '../domain/index.ts'
import { replaceMarkmapBlocks } from './markmap.ts'

/**
 * Expands `markmap` code blocks for the web form. The slides form renders the
 * same tag through Slidev's code block hook in setup/transformers.ts.
 */
const plugin: PresmiumNodePlugin = {
  id: CONTENT_ID,
  transformMarkdown: ({ content }) => replaceMarkmapBlocks(content),
}

export default plugin
