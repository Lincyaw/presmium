import type { IRBlock, IRDocument } from '@lincyaw/kernel'

/** Legacy prose remains visible without changing its authored narration binding. */
export function isLegacyNarration(document: IRDocument, block: IRBlock): boolean {
  return document.meta.contentModel !== 'blocks' && block.role === 'narration' && (!block.only || block.only.includes('lecture'))
}
