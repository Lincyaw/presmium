/**
 * Pass 5 (docs/ir.md section 2.4). Steps are numbered in source order; step 0
 * is the initial state. Two positions advance through the section: the last
 * step used so far, and the current step that narration binds to.
 * - A visual block without `:reveal:` appears at step 0.
 * - A block with `:reveal:` appears at the step after the last one used.
 * - The blocks of a `{slide}` or `{only}` with `:reveal:` form a group and all
 *   appear at that next step.
 * - A block with a `span` (stepwise highlight, list items, a stepper) appears
 *   at the last step used, unless it reveals, and takes the `span` steps after
 *   `at`: its internal steps always follow the steps before it, so it is not
 *   on screen at step 0 when earlier blocks reveal.
 * - Narration binds to the nearest visual block before it: the first
 *   narration block after it to its `at`, the next one to `at + 1`, and so on
 *   up to `at + span`, so an author can write one paragraph per step. Before
 *   any visual block, narration binds to step 0.
 *
 * Also gives every block its id: its label, or `<kind>-<n>` numbered per kind
 * in source order. Generated ids are stable across recompiles of the same
 * source but shift when a block of the same kind is inserted before them;
 * only a label `(name)=` gives an id that survives edits.
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

  let last = 0
  // The nearest visual block: where it appears, its span, and how many narration blocks followed it.
  let current = 0
  let currentSpan = 0
  let narrated = 0
  const groups = new Map<number, number>()
  const blocks = drafts.map((draft, i): IRBlock => {
    const { group } = draft
    if (group !== undefined && !groups.has(group)) {
      // A group takes a step of its own when it shows something not revealed separately.
      if (drafts.some(d => d.group === group && d.role === 'visual' && !d.reveal)) {
        current = ++last
        currentSpan = 0
        narrated = 0
      }
      groups.set(group, current)
    }
    const at = draft.reveal ? last + 1
      : draft.role === 'narration' ? current + Math.min(narrated, currentSpan)
      : draft.span > 0 ? last
      : group !== undefined ? groups.get(group)!
      : 0
    if (draft.role === 'visual') {
      current = at
      currentSpan = draft.span
      narrated = 0
    }
    else if (draft.role === 'narration') {
      narrated++
    }
    last = Math.max(last, at + draft.span)
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
  return { blocks, steps: last }
}
