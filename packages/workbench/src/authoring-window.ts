import { randomUUID } from '@lincyaw/kernel'
import type { AuthoringWindowAcknowledgement, AuthoringWindowEvent, AuthoringWindowSnapshot } from '@lincyaw/kernel'
import type { Workbench } from './workbench.ts'

/** One root-lifetime reader on the existing socket, independent of document attachments. */
export function connectAuthoringWindow(workbench: Workbench): () => void {
  const open = workbench.client.openAuthoringWindow
  if (!open) return () => {}
  const clientId = randomUUID(), epoch = randomUUID(), seen = new Set<string>()
  let closed = false, connectionId: string | undefined, revision = 0, sequence = 0, signature: string | undefined
  const compositions = new Set<EventTarget>()
  let inputRevision = 0, lastInputRevision = 0
  let content: object | undefined, drafts: string | undefined, playback: number | undefined, view: string | undefined
  let active: { requestId: string, controller: AbortController, navigation: boolean } | undefined
  let reports: Promise<void> = Promise.resolve(), pending: AuthoringWindowSnapshot | undefined, sending = false
  const snapshot = () => {
    for (const target of compositions) if (target instanceof Node && !target.isConnected) compositions.delete(target)
    const value = workbench.authoringWindowSnapshot(0), state = workbench.state, bank = workbench.authoringDraftRevision()
    if (compositions.size) value.actions = ['window.read']
    const next = JSON.stringify(value)
    if (next !== signature || content !== state.authoring?.content || bank !== drafts || playback !== state.productionNavigationVersion || view !== state.webView || inputRevision !== lastInputRevision) {
      revision++; signature = next; content = state.authoring?.content; drafts = bank; playback = state.productionNavigationVersion; view = state.webView; lastInputRevision = inputRevision
    }
    return { ...value, revision }
  }
  const send = (connection: string, value: AuthoringWindowSnapshot, acknowledgement?: Omit<AuthoringWindowAcknowledgement, 'sequence' | 'snapshot'>, guard?: () => void) => {
    const report = { sequence: ++sequence, snapshot: value, ...acknowledgement }
    const next = reports.then(() => {
      if (closed || connectionId !== connection) throw new Error('window-connection-changed')
      guard?.()
      return acknowledgement ? channel.acknowledge(connection, report as AuthoringWindowAcknowledgement) : channel.publish(connection, report)
    })
    reports = next.catch(() => {}); return next
  }
  const publish = (value: AuthoringWindowSnapshot) => {
    pending = value
    if (sending) return
    sending = true
    void (async () => {
      try {
        while (pending && connectionId) { pending = undefined; const connection = connectionId; await send(connection, snapshot()).catch(() => {}) }
      } finally { sending = false }
    })()
  }
  const received = async (event: AuthoringWindowEvent) => {
    if (closed) return
    if (event.type === 'connected') { active?.controller.abort(); active = undefined; connectionId = event.connectionId; publish(snapshot()); return }
    if (event.type === 'cancel') { if (event.connectionId === connectionId && active?.requestId === event.requestId) active.controller.abort(new Error('window-request-cancelled')); return }
    const connection = connectionId, request = event.request
    if (!connection || request.clientId !== clientId || request.epoch !== epoch || request.connectionId !== connection || seen.has(request.requestId)) return
    seen.add(request.requestId); if (seen.size > 64) seen.delete(seen.values().next().value!)
    const initial = snapshot()
    if (active || initial.revision !== request.revision || !initial.actions.includes(request.action.type) || Date.now() >= Date.parse(event.expiresAt)) {
      await send(connection, initial, { requestId: request.requestId, state: 'refused', error: { code: 'window-state-changed' } }).catch(() => {}); return
    }
    const controller = new AbortController(), task = { requestId: request.requestId, controller, navigation: request.action.type !== 'window.read' }
    active = task
    const owned = () => { controller.signal.throwIfAborted(); if (closed || connectionId !== connection || active !== task || Date.now() >= Date.parse(event.expiresAt)) throw new Error('window-request-expired') }
    const timeout = setTimeout(() => controller.abort(new Error('window-request-expired')), Math.max(0, Date.parse(event.expiresAt) - Date.now()))
    try {
      await send(connection, initial, { requestId: request.requestId, state: 'executing' }, () => { owned(); if (snapshot().revision !== request.revision) throw new Error('window-state-changed') })
      owned()
      if (snapshot().revision !== request.revision) throw new Error('window-state-changed')
      const outcome = await workbench.executeAuthoringWindowAction(request, controller.signal)
      owned()
      const result = snapshot()
      await send(connection, result, { requestId: request.requestId, state: 'done', outcome }, () => { owned(); if (snapshot().revision !== result.revision) throw new Error('window-state-changed') })
    } catch (error) {
      const code = error instanceof Error && /^window-[a-z-]{1,100}$/.test(error.message) ? error.message : 'window-action-not-verified'
      if (!closed && connectionId === connection) await send(connection, snapshot(), { requestId: request.requestId, state: 'failed', error: { code } }).catch(() => {})
    } finally { clearTimeout(timeout); if (active === task) active = undefined }
  }
  const channel = open({ clientId, epoch, snapshot: snapshot() }, event => { void received(event) }, () => { connectionId = undefined; pending = undefined; active?.controller.abort(); active = undefined })
  const changed = () => { if (closed) return; const before = revision, value = snapshot(); if (before !== revision && connectionId) publish(value) }
  const stop = workbench.subscribe(changed), stopDrafts = workbench.subscribeAuthoringDraftChanges(changed)
  const interrupt = () => { if (active?.navigation) active.controller.abort(new Error('window-input-changed')) }
  const input = () => { inputRevision++; interrupt(); changed() }
  const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') interrupt() }
  const compositionStart = (event: CompositionEvent) => { if (event.target) compositions.add(event.target); input() }
  const compositionEnd = (event: CompositionEvent) => { if (event.target) compositions.delete(event.target); input() }
  // Only modal semantics matter. Text mutations and iframe animation frames never trigger publications.
  const modal = typeof MutationObserver === 'undefined' ? undefined : new MutationObserver(records => {
    const modalChange = records.some(record => record.type === 'attributes' || [...record.addedNodes, ...record.removedNodes].some(node => {
      return node instanceof Element && (node.matches('[role="dialog"]') || node.querySelector('[role="dialog"]'))
    }))
    if (modalChange || compositions.size > 0 && records.some(record => record.removedNodes.length > 0)) changed()
  })
  if (typeof document !== 'undefined') {
    modal?.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-modal', 'hidden', 'inert'] })
    document.addEventListener('input', input, true); document.addEventListener('compositionstart', compositionStart, true); document.addEventListener('compositionend', compositionEnd, true)
    document.addEventListener('pointerdown', interrupt, true); document.addEventListener('keydown', escape, true)
  }
  return () => {
    closed = true; stop(); stopDrafts(); modal?.disconnect(); active?.controller.abort(); channel.close(); pending = undefined; compositions.clear()
    if (typeof document !== 'undefined') {
      document.removeEventListener('input', input, true); document.removeEventListener('compositionstart', compositionStart, true); document.removeEventListener('compositionend', compositionEnd, true)
      document.removeEventListener('pointerdown', interrupt, true); document.removeEventListener('keydown', escape, true)
    }
  }
}
