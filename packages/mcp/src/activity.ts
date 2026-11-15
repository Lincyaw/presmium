import { isRecord } from '@lincyaw/kernel'
import type { AgentActivityOperation, AgentActivityTarget, TeachingDocument } from '@lincyaw/kernel'

/** Only structural IDs are copied to the UI, never arbitrary arguments or source text. */
export function activityTargets(args: Record<string, unknown>, document?: TeachingDocument): AgentActivityTarget[] {
  const id = (value: unknown) => typeof value === 'string' && value.length > 0 && value.length <= 200 ? value : undefined
  const values = [args, args.action, args.request, args.target, ...Array.isArray(args.operations) ? args.operations.slice(0, 16) : [],
    ...isRecord(args.change) && Array.isArray(args.change.operations) ? args.change.operations.slice(0, 16) : []]
  const targets: AgentActivityTarget[] = []
  for (const value of values) {
    if (!isRecord(value)) continue
    const page = value.sectionId ?? value.section
    const section = typeof page === 'number' ? document?.sectionOrder[page - 1]
      : typeof page === 'string' && document && !document.sections[page] && /^\d+$/.test(page) ? document.sectionOrder[Number(page) - 1] : id(page)
    const step = id(value.stepId) ?? (typeof value.step === 'number' && section ? document?.sections[section]?.stepOrder[value.step] : undefined)
    const target = { section: section ?? (step ? document?.steps[step]?.sectionId : undefined), block: id(value.blockId ?? value.block), step }
    if (Object.values(target).some(Boolean) && !targets.some(other => JSON.stringify(other) === JSON.stringify(target))) targets.push(target)
    if (targets.length >= 16) break
  }
  return targets
}

export function activityNeedsDocument(args: Record<string, unknown>): boolean {
  return [args, args.action, args.request, args.target].some(value => isRecord(value) && (typeof value.section === 'number' || typeof value.step === 'number' || typeof value.section === 'string' && /^\d+$/.test(value.section)))
}

export function activityOperation(name: string, read: boolean): AgentActivityOperation {
  if (read) return 'read'
  if (name === 'edit_narration') return 'edit'
  if (/voice|speech|narration/.test(name)) return 'voice'
  if (/build|compile|export/.test(name)) return 'build'
  if (/capture|preview/.test(name)) return 'preview'
  if (/navigate|editor_action/.test(name)) return 'navigate'
  if (/project|workspace/.test(name)) return 'workspace'
  return 'edit'
}
