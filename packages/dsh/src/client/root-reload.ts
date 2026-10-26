import type { Workbench } from '@lincyaw/workbench'

const KEY = 'presmium.root-reload.v1'
const CODE = Symbol('Presmium root client code')

interface ReturnPoint {
  workspace: string
  directory: string
  documentId: string
  sectionId?: string
  stepId?: string
}

interface Checkpoint { version: 1, armed: boolean, point?: ReturnPoint }

declare global {
  interface Window {
    /** A page-lifetime flag, never a retained plugin, context or React root. */
    __presmiumRootReload?: symbol | 'reloading'
  }
}

function checkpoint(): Checkpoint | undefined {
  const value: unknown = JSON.parse(sessionStorage.getItem(KEY) ?? 'null')
  if (!value || typeof value !== 'object' || !('version' in value) || value.version !== 1 || !('armed' in value) || typeof value.armed !== 'boolean') return
  if (!('point' in value) || value.point === undefined) return { version: 1, armed: value.armed }
  const point = value.point
  if (!point || typeof point !== 'object' || !('workspace' in point) || typeof point.workspace !== 'string'
    || !('directory' in point) || typeof point.directory !== 'string' || !('documentId' in point) || typeof point.documentId !== 'string'
    || 'sectionId' in point && typeof point.sectionId !== 'string' || 'stepId' in point && typeof point.stepId !== 'string') return
  return value as Checkpoint
}

/** Root-owner code replacement needs a new shell mount in this Harness version. */
export function beginRootReload(): { reloading: boolean, point?: ReturnPoint } {
  if (window.__presmiumRootReload && window.__presmiumRootReload !== CODE) {
    if (window.__presmiumRootReload === 'reloading') return { reloading: true }
    try {
      const saved = checkpoint()
      if (!saved) throw new Error('missing root return checkpoint')
      sessionStorage.setItem(KEY, JSON.stringify({ ...saved, armed: true } satisfies Checkpoint))
      window.__presmiumRootReload = 'reloading'
      window.location.reload()
    } catch {
      // Do not navigate away when recovery storage could not be confirmed.
      console.error('Presmium could not preserve the root reload checkpoint; automatic reload was stopped.')
    }
    return { reloading: true }
  }
  window.__presmiumRootReload = CODE
  try {
    const saved = checkpoint()
    sessionStorage.removeItem(KEY)
    return { reloading: false, ...saved?.armed && saved.point ? { point: saved.point } : {} }
  } catch {
    return { reloading: false }
  }
}

/** Store only a return address; document drafts keep their existing persistence and review rules. */
export function saveRootReturnPoint(workbench: Workbench): void {
  const state = workbench.state, source = state.authoring
  try {
    if (source?.storageFailure) throw new Error('document recovery storage unavailable')
    let point: ReturnPoint | undefined
    if (state.document !== undefined && source?.identity && source.content) {
      const identity: unknown = JSON.parse(source.identity)
      if (Array.isArray(identity) && identity.length === 2 && typeof identity[0] === 'string' && identity[1] === source.content.id) {
        const sectionId = state.position?.section, section = sectionId ? source.content.sections[sectionId] : undefined
        const stepId = section?.stepOrder[state.position?.step ?? 0]
        point = { workspace: identity[0], directory: state.document, documentId: source.content.id, ...section ? { sectionId, stepId } : {} }
      }
    }
    sessionStorage.setItem(KEY, JSON.stringify({ version: 1, armed: false, ...point ? { point } : {} } satisfies Checkpoint))
  } catch {
    // A previous checkpoint must not authorize a reload after this save failed.
    try { sessionStorage.removeItem(KEY) } catch { /* Storage is unavailable. */ }
  }
}

/** Consume a one-shot return point only against the same actual workspace and source identity. */
export function restoreRootReturnPoint(workbench: Workbench, point: ReturnPoint | undefined): () => void {
  let active = true
  const stop = workbench.subscribe(() => { if (workbench.state.document !== undefined) active = false })
  const restore = async () => {
    if (!point) return
    const info = await workbench.client.readWorkbenchInfo()
    if (!active || info.root !== point.workspace || workbench.state.document !== undefined) return
    const source = await workbench.client.readDocument(point.directory)
    if (!active || source.content.id !== point.documentId || workbench.state.document !== undefined) return
    stop()
    await workbench.openDocument(point.directory)
    const current = workbench.state.authoring
    if (!active || current?.identity !== JSON.stringify([point.workspace, point.documentId])) return
    const section = point.sectionId && current.content?.sections[point.sectionId]
    if (!section) return
    workbench.goToSection(section.id)
    if (point.stepId && section.stepOrder.includes(point.stepId)) workbench.selectDocumentStep(section.id, point.stepId)
  }
  void restore().catch(() => { /* The normal home remains available when the return address no longer exists. */ }).finally(stop)
  return () => { active = false; stop() }
}
