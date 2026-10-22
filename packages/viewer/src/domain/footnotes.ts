import { docBlocks } from '@lincyaw/kernel'
import type { IRDocument, MdastNode } from '@lincyaw/kernel'

function definitions(node: MdastNode, found: (identifier: string) => void): void {
  if (node.type === 'footnoteDefinition' && node.identifier !== undefined) found(String(node.identifier))
  node.children?.forEach(child => definitions(child, found))
}

export function footnoteSections(doc: IRDocument): Map<string, string> {
  const sections = new Map<string, string>()
  for (const { section, block: { node } } of docBlocks(doc)) {
    if (node.type === 'markdown') definitions(node.mdast, identifier => sections.set(identifier, section.id))
  }
  return sections
}
