import type { Finding, IRBlock } from '@lincyaw/kernel'
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
    const explicitNarration = draft.role === 'narration' && draft.node.type === 'markdown' && draft.node.narration !== undefined
    if (draft.until !== undefined && draft.until <= at) report({ checkId: 'presmium.steps', severity: 'error', message: ':until: must be greater than the block’s starting step', source: draft.source })
    if (draft.role === 'visual') {
      current = at
      currentSpan = draft.span
      narrated = 0
    }
    else if (draft.role === 'narration' && (!explicitNarration || at === current + Math.min(narrated, currentSpan))) {
      narrated++
    }
    // Pinning speech must not move the next animation. Replacing an implicit paragraph still occupies its slot.
    if (!explicitNarration) last = Math.max(last, at + draft.span, draft.until ?? 0)
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
  return { blocks, steps: Math.max(last, ...blocks.map(b => b.at)) }
}

export { compactSteps } from '@lincyaw/kernel'
