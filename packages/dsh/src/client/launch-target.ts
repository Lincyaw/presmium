import type { Workbench } from '@lincyaw/workbench'
import { restoreRootReturnPoint } from './root-reload.ts'

const PREFIX = '#presmium?'
const INTERACTIONS = ['pointerdown', 'keydown', 'beforeinput', 'wheel', 'touchmove']

interface LaunchTarget { directory: string, documentId: string, sectionId?: string }

/** This fragment belongs to Presmium; Harness's authenticated root and API routes keep their own paths. */
export function parseLaunchTarget(fragment: string): LaunchTarget | undefined {
  if (!fragment.startsWith(PREFIX) || fragment.length > 8192) return
  const params = new URLSearchParams(fragment.slice(PREFIX.length))
  const keys = ['document', 'id', 'section', 'request']
  if ([...params.keys()].some(key => !keys.includes(key)) || keys.some(key => params.getAll(key).length > 1)) return
  const request = params.get('request')
  if (request !== null && !/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(request)) return
  const directory = params.get('document'), documentId = params.get('id'), sectionId = params.get('section')
  if (directory === null || !documentId || sectionId === '' || /[\\:\u0000-\u001f\u007f]/.test(directory)
    || directory !== '' && directory.split('/').some(part => !part || part === '.' || part === '..')) return
  return { directory, documentId, ...sectionId !== null ? { sectionId } : {} }
}

/** Explicit addresses outrank reload recovery; source identity and ordinary user navigation still own adoption. */
export function connectLaunchTarget(workbench: Workbench, restore: () => () => void, showDocument: () => void): () => void {
  let closed = false, generation = 0
  let stopPending: (() => void) | undefined, stopReturn: (() => void) | undefined
  const open = (initial = false) => {
    const request = ++generation, fragment = window.location.hash
    stopPending?.(); stopPending = undefined
    stopReturn?.()
    if (initial && !fragment.startsWith(PREFIX)) { stopReturn = restore(); return }
    // Keep the ordinary address retention, without opening an older checkpoint behind this explicit intent.
    stopReturn = restoreRootReturnPoint(workbench, undefined)
    const target = parseLaunchTarget(fragment)
    if (!target) return
    let active = true, ownOpening = false, committing = false
    const beforeDocument = workbench.state.document
    let navigation = workbench.documentNavigationVersion
    let position = workbench.state.documentPositionToken, view = workbench.state.webView
    const current = () => active && !closed && request === generation && window.location.hash === fragment
      && workbench.documentNavigationVersion === navigation && workbench.state.webView === view
    const cancel = () => { active = false }
    const interact = (event: Event) => { if (event.isTrusted) cancel() }
    for (const name of INTERACTIONS) document.addEventListener(name, interact, true)
    const stop = workbench.subscribe(() => {
      if (committing) return
      if (!current() || !ownOpening && workbench.state.documentPositionToken !== position) cancel()
    })
    const close = () => {
      cancel(); stop()
      for (const name of INTERACTIONS) document.removeEventListener(name, interact, true)
    }
    stopPending = close
    const launch = async () => {
      const [info] = await Promise.all([workbench.client.readWorkbenchInfo(), workbench.loadDocuments()])
      if (!current() || !info.root || !workbench.state.documents?.documents.some(doc => doc.dir === target.directory)) return
      // Only an already listed directory can be read. A stale ID or missing page never changes the current selection.
      const answer = await workbench.client.readDocument(target.directory)
      if (!current() || answer.content.id !== target.documentId
        || !workbench.state.documents?.documents.some(doc => doc.dir === target.directory)
        || target.sectionId && (!answer.content.sectionOrder.includes(target.sectionId) || !answer.content.sections[target.sectionId])) return
      const identity = JSON.stringify([info.root, target.documentId])
      ownOpening = true
      committing = true
      const opened = workbench.openDocument(target.directory, { expectedIdentity: identity })
      navigation = workbench.documentNavigationVersion
      position = workbench.state.documentPositionToken
      view = workbench.state.webView
      committing = false
      await opened
      if (!current() || workbench.state.document !== target.directory || workbench.state.authoring?.identity !== identity
        || workbench.state.authoring.content?.id !== target.documentId) return
      const section = target.sectionId
      if (section && (!workbench.state.authoring.content.sectionOrder.includes(section) || !workbench.state.authoring.content.sections[section])) return
      // A retained document keeps its editing or playback view; a newly opened document starts in Doc.
      close()
      showDocument()
      if (beforeDocument !== target.directory && workbench.state.webView === 'document' && section) workbench.goToSection(section)
    }
    void launch().catch(() => { /* Invalid or unavailable addresses leave the ordinary document UI available. */ }).finally(() => {
      close()
      if (stopPending === close) stopPending = undefined
    })
  }
  const changed = () => open()
  window.addEventListener('hashchange', changed)
  open(true)
  return () => { closed = true; generation++; stopPending?.(); stopReturn?.(); window.removeEventListener('hashchange', changed) }
}
