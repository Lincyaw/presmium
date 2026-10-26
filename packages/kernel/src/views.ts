import { irBlocks } from './blocks.ts'
import type { IRBlock, IRDocument, IRSection } from './ir.ts'

/**
 * Closes the gaps that removed blocks leave in a section's steps. With `stepMap`, the section records
 * the new number of each old step, so positions in the whole document can be mapped to it.
 */
export function compactSteps(section: IRSection, options: { stepMap?: boolean } = {}): IRSection {
  // Explicit authoring steps can carry narration and production timing even
  // when this renderer has no visual change. Keep their identities and states.
  if (section.stepIds) return options.stepMap ? { ...section, stepMap: section.stepIds.map((_, index) => index) } : section
  const used = new Set([0])
  for (const block of irBlocks(section.blocks)) {
    if (block.role !== 'visual') continue
    for (let step = block.at; step <= block.at + (block.span ?? 0); step++) used.add(step)
    if (block.until !== undefined) used.add(block.until)
  }
  if (used.size > section.steps) return section
  const stepMap: number[] = []
  for (let step = 0, n = -1; step <= section.steps; step++) stepMap.push(used.has(step) ? ++n : n)
  const map = (step: number) => stepMap[Math.min(step, section.steps)]!
  const renumber = (blocks: IRBlock[]): IRBlock[] => blocks.map(block => ({
    ...block,
    at: map(block.at),
    ...block.until === undefined ? {} : { until: map(block.until) },
    ...block.node.type === 'component' && block.node.children ? { node: { ...block.node, children: renumber(block.node.children) } } : {},
  }))
  return { ...section, steps: map(section.steps), ...options.stepMap ? { stepMap } : {}, blocks: renumber(section.blocks) }
}

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
