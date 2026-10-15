import type { IRBlock, MdastNode } from '@presmium/kernel'

const BREAKS = new Set(['paragraph', 'heading', 'listItem', 'tableRow', 'tableCell', 'code', 'math', 'blockquote', 'break'])

/** The text of an mdast tree; block-level nodes are separated by line breaks. */
export function mdastText(node: MdastNode): string {
  if (typeof node.value === 'string' && !node.children) return node.value
  const text = (node.children ?? []).map(mdastText).join('')
  return BREAKS.has(node.type) ? `${text}\n` : text
}

/** String values of component props, e.g. the labels of a stepper. */
function propText(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(propText)
  if (value && typeof value === 'object') return Object.values(value).flatMap(propText)
  return []
}

/** The readable text of a block: prose, code, recorded output, component props and children. */
export function blockText(block: IRBlock): string {
  const { node } = block
  switch (node.type) {
    case 'markdown': return mdastText(node.mdast).trim()
    case 'code': return [node.title, node.value, ...(node.outputs ?? []).map(o => o.stdout)].filter(Boolean).join('\n')
    case 'component': return [...propText(node.props), ...(node.children ?? []).map(blockText)].join('\n')
  }
}
