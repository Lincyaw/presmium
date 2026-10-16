/** Walking the blocks of the IR: every block, the children of components included. */
import type { IRBlock, IRDocument, IRNode, IRSection, MdastNode } from './ir.ts'

/** Each block in document order, followed by the blocks of a component's `children`, depth first. */
export function* irBlocks(blocks: readonly IRBlock[]): Generator<IRBlock> {
  for (const block of blocks) {
    yield block
    if (block.node.type === 'component' && block.node.children) yield* irBlocks(block.node.children)
  }
}

/** Every block of the document with its section, in document order (see `irBlocks`). */
export function* docBlocks(doc: IRDocument): Generator<{ section: IRSection, block: IRBlock }> {
  for (const section of doc.sections) {
    for (const block of irBlocks(section.blocks)) yield { section, block }
  }
}

/** The mdast a node shows: a Markdown node's tree, or a component's `fallback`. */
export function nodeMdast(node: IRNode): MdastNode[] {
  if (node.type === 'markdown') return [node.mdast]
  return node.type === 'component' && node.fallback ? [node.fallback] : []
}
