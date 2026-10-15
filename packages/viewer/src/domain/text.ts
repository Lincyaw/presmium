import type { IRBlock, IRDocument, MdastNode } from '@presmium/kernel'

const BREAKS = new Set(['paragraph', 'heading', 'listItem', 'tableRow', 'tableCell', 'code', 'math', 'blockquote', 'break'])

/** The text raw HTML shows: its tags, styles and scripts left out. */
function htmlText(html: string): string {
  return html.replace(/<(style|script)\b[\s\S]*?<\/\1\s*>/gi, ' ').replace(/<[^>]*>/g, ' ')
}

/** The text of an mdast tree; block-level nodes are separated by line breaks. */
export function mdastText(node: MdastNode): string {
  if (node.type === 'html' && typeof node.value === 'string') return htmlText(node.value)
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

function definitions(node: MdastNode, found: (identifier: string) => void): void {
  if (node.type === 'footnoteDefinition' && node.identifier !== undefined) found(String(node.identifier))
  node.children?.forEach(child => definitions(child, found))
}

/**
 * The section holding each footnote definition, by identifier. MyST moves
 * definitions to the end of the document, so a reference may point to
 * another section, or another page.
 */
export function footnoteSections(doc: IRDocument): Map<string, string> {
  const sections = new Map<string, string>()
  const visit = (section: string, blocks: readonly IRBlock[]) => {
    for (const { node } of blocks) {
      if (node.type === 'markdown') definitions(node.mdast, identifier => sections.set(identifier, section))
      if (node.type === 'component') visit(section, node.children ?? [])
    }
  }
  for (const section of doc.sections) visit(section.id, section.blocks)
  return sections
}
