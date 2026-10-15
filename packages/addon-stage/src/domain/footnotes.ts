import type { IRBlock, IRDocument, IRSection, MdastNode } from '@presmium/kernel'

/**
 * Footnotes (P-01). The MyST parser moves every footnote definition to the
 * end of its file, so a definition lands in the last section of the file, as
 * narration. This puts each definition back into the section that first
 * references it, after that section's blocks, with the role and step of the
 * referencing block: a footnote of a slide is shown on that slide.
 */
export function placeFootnotes(doc: IRDocument): void {
  const definitions: { section: IRSection, block: IRBlock, identifier: string }[] = []
  for (const section of doc.sections) {
    for (const block of section.blocks) {
      const identifier = definitionOf(block)
      if (identifier !== undefined) definitions.push({ section, block, identifier })
    }
  }
  for (const { section, block, identifier } of definitions) {
    const owner = firstReference(doc, identifier)
    if (!owner || (owner.section === section && owner.block.role === block.role)) continue
    section.blocks.splice(section.blocks.indexOf(block), 1)
    const ids = new Set(owner.section.blocks.map(b => b.id))
    let id = block.id
    for (let n = 2; ids.has(id); n++) id = `${block.id}-${n}`
    owner.section.blocks.push({ ...block, id, role: owner.block.role, at: owner.block.at, ...owner.block.only ? { only: owner.block.only } : {} })
  }
}

/** The identifier of a block that holds a footnote definition and nothing else. */
function definitionOf(block: IRBlock): string | undefined {
  if (block.node.type !== 'markdown') return undefined
  const [first, ...rest] = block.node.mdast.children ?? []
  return first?.type === 'footnoteDefinition' && rest.length === 0 && typeof first.identifier === 'string' ? first.identifier : undefined
}

function firstReference(doc: IRDocument, identifier: string): { section: IRSection, block: IRBlock } | undefined {
  for (const section of doc.sections) {
    const block = section.blocks.find(b => b.node.type === 'markdown' && references(b.node.mdast, identifier))
    if (block) return { section, block }
  }
  return undefined
}

function references(node: MdastNode, identifier: string): boolean {
  return (node.type === 'footnoteReference' && node.identifier === identifier) || (node.children ?? []).some(c => references(c, identifier))
}
