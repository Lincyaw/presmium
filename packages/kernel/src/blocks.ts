import type { IRBlock, IRDocument, IRNode, IRSection, MdastNode } from './ir.ts'

export function* irBlocks(blocks: readonly IRBlock[]): Generator<IRBlock> {
  for (const block of blocks) {
    yield block
    if (block.node.type === 'component' && block.node.children) yield* irBlocks(block.node.children)
  }
}

export function* docBlocks(doc: IRDocument): Generator<{ section: IRSection, block: IRBlock }> {
  for (const section of doc.sections) {
    for (const block of irBlocks(section.blocks)) yield { section, block }
  }
}

export function nodeMdast(node: IRNode): MdastNode[] {
  if (node.type === 'markdown') return [node.mdast]
  return node.type === 'component' && node.fallback ? [node.fallback] : []
}
