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

/**
 * `props` with the property at `path` set to `value`: each `.` of the path
 * goes one object property deeper (`ComponentNode.assets` keys such as
 * `captions.en`), copying the objects on the way; `props` is not changed.
 */
export function withProp(props: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
  const [key = '', ...rest] = path.split('.')
  if (rest.length === 0) return { ...props, [key]: value }
  const inner = props[key]
  const object = inner !== null && typeof inner === 'object' && !Array.isArray(inner) ? inner as Record<string, unknown> : {}
  return { ...props, [key]: withProp(object, rest.join('.'), value) }
}
