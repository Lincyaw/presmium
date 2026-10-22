import { irBlocks } from '@lincyaw/kernel'
import type { Finding, IRBlock, IRSection } from '@lincyaw/kernel'
import type { BlockDraft } from './blocks.ts'
import { unique } from './sections.ts'

export function scheduleSteps(drafts: BlockDraft[], report: (finding: Finding) => void): { blocks: IRBlock[], steps: number } {
  const used = new Set<string>()
  for (const { label, source } of drafts) {
    if (!label) continue
    if (used.has(label)) report({ checkId: 'presmium.sections', severity: 'error', message: `duplicate block label (${label})= in this section`, source: { file: source.file, line: source.line } })
    used.add(label)
  }
  const counts = new Map<string, number>()
  const ids = drafts.map(({ label, kind }) => {
    if (label) return label
    let id: string
    do {
      const n = (counts.get(kind) ?? 0) + 1
      counts.set(kind, n)
      id = `${kind}-${n}`
    } while (used.has(id))
    return unique(id, used)
  })

  let last = 0
  let current = 0
  let currentSpan = 0
  let narrated = 0
  const groups = new Map<number, number>()
  const blocks = drafts.map((draft, i): IRBlock => {
    const { group } = draft
    if (group !== undefined && !groups.has(group)) {
      if (drafts.some(d => d.group === group && d.role === 'visual' && !d.reveal)) {
        current = ++last
        currentSpan = 0
        narrated = 0
      }
      groups.set(group, current)
    }
    const at = draft.at ?? (draft.reveal ? last + 1
      : draft.role === 'narration' ? current + Math.min(narrated, currentSpan)
      : draft.span > 0 ? last
      : group !== undefined ? groups.get(group)!
      : 0)
    if (draft.until !== undefined && draft.until <= at) report({ checkId: 'presmium.steps', severity: 'error', message: ':until: must be greater than the block’s starting step', source: draft.source })
    if (draft.role === 'visual') {
      current = at
      currentSpan = draft.span
      narrated = 0
    }
    else if (draft.role === 'narration') {
      narrated++
    }
    last = Math.max(last, at + draft.span, draft.until ?? 0)
    return {
      id: ids[i]!,
      role: draft.role,
      at,
      ...draft.until !== undefined ? { until: draft.until } : {},
      ...draft.span > 0 ? { span: draft.span } : {},
      ...draft.only ? { only: draft.only } : {},
      source: draft.source,
      node: draft.node,
    }
  })
  return { blocks, steps: last }
}

/**
 * Closes the gaps that removed blocks leave in a section's steps. With `stepMap`, the section records
 * the new number of each old step, so positions in the whole document can be mapped to it.
 */
export function compactSteps(section: IRSection, options: { stepMap?: boolean } = {}): IRSection {
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
