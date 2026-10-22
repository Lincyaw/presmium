import type { IRBlock, IRDocument } from '@lincyaw/kernel'
import { compactSteps } from './steps.ts'

/** The document as one renderer sees it: blocks limited to other renderers are gone, the steps closed up. */
export function viewFor(doc: IRDocument, renderer: string): IRDocument {
  let changed = false
  const keep = (blocks: IRBlock[]): IRBlock[] => blocks.flatMap((block) => {
    if (block.only && !block.only.includes(renderer)) {
      changed = true
      return []
    }
    return block.node.type === 'component' && block.node.children ? [{ ...block, node: { ...block.node, children: keep(block.node.children) } }] : [block]
  })
  const sections = doc.sections.map((section) => {
    changed = false
    const blocks = keep(section.blocks)
    return changed ? compactSteps({ ...section, blocks }, { stepMap: true }) : section
  })
  return { ...doc, sections }
}
