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

function readOpenDocument(): ReturnPoint | undefined {
  try {
    const point: unknown = JSON.parse(sessionStorage.getItem(DOCUMENT_KEY) ?? 'null')
    if (isReturnPoint(point)) return point
  } catch { /* Invalid or unavailable storage cannot authorize navigation. */ }
  try { sessionStorage.removeItem(DOCUMENT_KEY) } catch { /* Editing remains available. */ }
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
  const opened = readOpenDocument()
  try {
    const saved = checkpoint()
    sessionStorage.removeItem(KEY)
    const point = saved?.armed && saved.point ? saved.point : opened
    return { reloading: false, ...point ? { point } : {} }
  } catch {
    return { reloading: false, ...opened ? { point: opened } : {} }
  }
}

/** Keep a pending address through another reload; only explicit navigation or settlement retires it. */
function retainOpenDocument(workbench: Workbench, returning?: ReturnPoint): { open<T>(start: () => T): T, settle(): void, close(): void } {
  let previous: string | undefined
  let pending = Boolean(returning)
  let opening = false, closed = false
  const navigation = workbench.documentNavigationVersion
  let remembered: ReturnPoint | undefined
  const write = (point: ReturnPoint | undefined) => {
    const next = point ? JSON.stringify(point) : ''
    if (next === previous) return
    try {
      if (point) sessionStorage.setItem(DOCUMENT_KEY, next)
      else sessionStorage.removeItem(DOCUMENT_KEY)
      previous = next
      remembered = point
    } catch {
      // Do not keep an earlier address after a later explicit choice could not be stored.
      try { sessionStorage.removeItem(DOCUMENT_KEY) } catch { /* Editing does not depend on address storage. */ }
      previous = undefined
      remembered = undefined
    }
  }
  if (returning) write({ workspace: returning.workspace, directory: returning.directory, documentId: returning.documentId })
  const retain = () => {
    if (closed || opening) return
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
    if (point) write(point)
    else if (document === undefined) {
      if (!pending || workbench.documentNavigationVersion !== navigation) write(undefined)
    } else if (remembered?.directory !== document) write(undefined)
  }
  const stop = workbench.subscribe(retain)
  retain()
  return {
    // Opening synchronously emits an intermediate Home while retiring the previous subscriptions.
    open<T>(start: () => T): T { opening = true; try { return start() } finally { opening = false; retain() } },
    settle() { if (!closed) { pending = false; retain() } },
    close() { closed = true; stop() },
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

/** Restore only within this navigation; final source adoption checks the expected workspace and identity. */
export function restoreRootReturnPoint(workbench: Workbench, point: ReturnPoint | undefined): () => void {
  let active = true
  const retaining = retainOpenDocument(workbench, point), navigation = workbench.documentNavigationVersion
  const stop = workbench.subscribe(() => { if (workbench.documentNavigationVersion !== navigation) active = false })
  const restore = async () => {
    if (!point) return
    const info = await workbench.client.readWorkbenchInfo()
    if (!active || info.root !== point.workspace || workbench.state.document !== undefined) return
    stop()
    await retaining.open(() => workbench.openDocument(point.directory, {
      expectedIdentity: JSON.stringify([point.workspace, point.documentId]),
      ...point.sectionId ? { fallbackReturnPoint: { sectionId: point.sectionId, ...point.stepId ? { stepId: point.stepId } : {} } } : {},
    }))
  }
  void restore().catch(() => { /* The normal home remains available when the return address no longer exists. */ }).finally(() => { stop(); retaining.settle() })
  return () => { active = false; stop(); retaining.close() }
}
