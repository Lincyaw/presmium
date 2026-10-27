import type { Workbench } from '@lincyaw/workbench'

const KEY = 'presmium.root-reload.v1'
const DOCUMENT_KEY = 'presmium.open-document.v1'
const CODE = Symbol('Presmium root client code')

interface ReturnPoint {
  workspace: string
  directory: string
  documentId: string
  sectionId?: string
  stepId?: string
}

interface Checkpoint { version: 1, armed: boolean, point?: ReturnPoint }

function isReturnPoint(point: unknown): point is ReturnPoint {
  return Boolean(point && typeof point === 'object' && 'workspace' in point && typeof point.workspace === 'string'
    && 'directory' in point && typeof point.directory === 'string' && 'documentId' in point && typeof point.documentId === 'string'
    && (!('sectionId' in point) || typeof point.sectionId === 'string') && (!('stepId' in point) || typeof point.stepId === 'string'))
}

function takeOpenDocument(): ReturnPoint | undefined {
  try {
    const point: unknown = JSON.parse(sessionStorage.getItem(DOCUMENT_KEY) ?? 'null')
    sessionStorage.removeItem(DOCUMENT_KEY)
    return isReturnPoint(point) ? point : undefined
  } catch { return }
}

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
  if (!isReturnPoint(point)) return
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
  const opened = takeOpenDocument()
  try {
    const saved = checkpoint()
    sessionStorage.removeItem(KEY)
    const point = saved?.armed && saved.point ? saved.point : opened
    return { reloading: false, ...point ? { point } : {} }
  } catch {
    return { reloading: false, ...opened ? { point: opened } : {} }
  }
}

/** Keep the tab's explicit document address; page/step/scroll recovery stays with Workbench. */
export function retainOpenDocument(workbench: Workbench): () => void {
  let previous: string | undefined
  const retain = () => {
    const { document, authoring } = workbench.state
    let point: ReturnPoint | undefined
    if (document !== undefined && authoring?.directory === document && authoring.identity && authoring.content) {
      try {
        const identity: unknown = JSON.parse(authoring.identity)
        if (Array.isArray(identity) && identity.length === 2 && typeof identity[0] === 'string' && identity[1] === authoring.content.id) {
          point = { workspace: identity[0], directory: document, documentId: authoring.content.id }
        }
      } catch { /* An unknown identity cannot authorize opening another document. */ }
    }
    const next = point ? JSON.stringify(point) : ''
    if (next === previous) return
    try {
      if (point) sessionStorage.setItem(DOCUMENT_KEY, next)
      else sessionStorage.removeItem(DOCUMENT_KEY)
      previous = next
    } catch { /* Document editing does not depend on return-address storage. */ }
  }
  const stop = workbench.subscribe(retain)
  retain()
  return stop
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
    await workbench.openDocument(point.directory, { expectedIdentity: JSON.stringify([point.workspace, point.documentId]) })
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
