import type { AgentActivity, PresmiumDocument } from '@lincyaw/kernel'
import type { DocumentProjection } from './projection.ts'

/** Decorative attributes only: canonical IDs resolve through the editor's existing projection. */
export function markAgentTargets(root: HTMLElement, projection: DocumentProjection, document: PresmiumDocument, activities: readonly AgentActivity[]): () => void {
  const marked = new Set<HTMLElement>()
  const mark = (element: HTMLElement | null, state: AgentActivity['state']) => {
    if (!element || marked.has(element)) return
    element.dataset.pmAgentTarget = state; marked.add(element)
  }
  for (const activity of [...activities].sort((a, b) => Number(b.state === 'running') - Number(a.state === 'running'))) {
    let found = false
    for (const target of activity.targets) {
      let targetFound = false
      if (target.block) for (const [native, owner] of projection.owners) {
        if (owner !== target.block) continue
        const element = root.querySelector<HTMLElement>(`[data-id="${CSS.escape(native)}"]`)
        if (element) { mark(element, activity.state); targetFound = true }
      }
      if (target.step) {
        const field = root.querySelector<HTMLElement>(`[data-step-narration="${CSS.escape(target.step)}"]`)
        if (field) targetFound = true // The shared narration component owns its decorative attribute.
      }
      const section = target.section ?? (target.step ? document.steps[target.step]?.sectionId : undefined)
      if (!targetFound && section) {
        const heading = root.querySelector<HTMLElement>(`[data-document-section="${CSS.escape(section)}"]`)
        if (heading) { mark(heading, activity.state); targetFound = true }
      }
      found ||= targetFound
    }
    if (!found) mark(root, activity.state)
  }
  return () => { for (const element of marked) delete element.dataset.pmAgentTarget }
}
