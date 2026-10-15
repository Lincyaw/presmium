/**
 * Pass 5 (docs/ir.md section 2.4). The current step starts at 0 and advances
 * through the section in source order:
 * - a visual block appears at step 0, or with `:reveal:` at the step after the current one;
 * - a block with a `span` (e.g. stepwise highlight) takes its steps after the current
 *   one, so it starts at the current step unless it reveals;
 * - narration belongs to the current step where it stands in the source.
 * Also gives every block its id: its label, or `<kind>-<n>`.
 */
import type { Finding, IRBlock } from '@presmium/kernel'
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

  let step = 0
  const blocks = drafts.map((draft, i): IRBlock => {
    const at = draft.reveal ? step + 1 : draft.role === 'visual' && draft.span === 0 ? 0 : step
    step = Math.max(step, at + draft.span)
    return {
      id: ids[i]!,
      role: draft.role,
      at,
      ...draft.span > 0 ? { span: draft.span } : {},
      ...draft.only ? { only: draft.only } : {},
      source: draft.source,
      node: draft.node,
    }
  })
  return { blocks, steps: step }
}
