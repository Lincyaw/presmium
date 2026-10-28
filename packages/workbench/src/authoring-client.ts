import { authoringClientResultFits } from '@lincyaw/kernel'
import type { AuthoringClientActionResult, AuthoringClientEvent, AuthoringClientSnapshot, CanonicalSource } from '@lincyaw/kernel'
import type { Workbench } from './workbench.ts'
import type { AuthoringClientChannel } from './workspace-client.ts'

const sameSource = (a: CanonicalSource, b: CanonicalSource) => a.documentId === b.documentId && a.version === b.version && a.fingerprint === b.fingerprint
// Clock samples are observations, not user input revisions. Never push at animation-frame frequency.
const signature = (value: AuthoringClientSnapshot) => JSON.stringify({ ...value, revision: 0, playback: value.playback && { ...value.playback,
  position: value.playback.position && { ...value.playback.position, timeMs: 0, stepTimeMs: 0 } } })
type Attachment = { directory: string, identity: string, epoch: string, channel: AuthoringClientChannel, connectionId?: string }

/** One logical reader on Studio's shared authenticated socket; no extra browser SSE or polling timer. */
export function connectAuthoringClient(workbench: Workbench): () => void {
  const open = workbench.client.openAuthoringClient
  if (!open) return () => {}
  const clientId = crypto.randomUUID()
  let closed = false, revision = 0, sequence = 0
  let attached: Attachment | undefined
  let lastSignature: string | undefined, lastContent: object | undefined
  let lastDraftRevision: string | undefined
  let active: { requestId: string, controller: AbortController } | undefined
  let reports: Promise<void> = Promise.resolve()
  let pendingState: { owner: Attachment, connectionId: string, value: AuthoringClientSnapshot } | undefined
  let stateSending = false
  const seen = new Set<string>()
  const snapshot = (): AuthoringClientSnapshot | undefined => {
    const value = workbench.authoringClientSnapshot(revision)
    if (!value) return
    const next = signature(value), content = workbench.state.authoring?.content, drafts = workbench.authoringDraftRevision()
    if (next !== lastSignature || content !== lastContent || drafts !== lastDraftRevision) { revision++; lastSignature = next; lastContent = content; lastDraftRevision = drafts }
    return { ...value, revision }
  }
  const detach = () => {
    active?.controller.abort(); active = undefined
    attached?.channel.close(); attached = undefined
    pendingState = undefined
    lastSignature = undefined; lastContent = undefined; lastDraftRevision = undefined; seen.clear()
  }
  const send = (owner: Attachment, connectionId: string, value: AuthoringClientSnapshot, acknowledgement?: { requestId: string, state: 'executing' | 'done' | 'refused' | 'failed', error?: { code: string }, result?: AuthoringClientActionResult }, preflight?: () => void) => {
    const report = { sequence: ++sequence, snapshot: value, ...acknowledgement }
    const next = reports.then(() => {
      if (closed || attached !== owner || owner.connectionId !== connectionId) throw new Error('client-connection-changed')
      preflight?.()
      return acknowledgement ? owner.channel.acknowledge(connectionId, report as import('@lincyaw/kernel').AuthoringClientAcknowledgement) : owner.channel.publish(connectionId, report)
    })
    reports = next.catch(() => {})
    return next
  }
  const publishState = (owner: Attachment, connectionId: string, value: AuthoringClientSnapshot) => {
    pendingState = { owner, connectionId, value }
    if (stateSending) return
    stateSending = true
    void (async () => {
      try {
        while (pendingState) {
          const pending = pendingState; pendingState = undefined
          if (attached !== pending.owner || attached.connectionId !== pending.connectionId) continue
          // Coalesce rapid input while a publication is in flight; never retain an unbounded keystroke queue.
          const latest = snapshot() ?? pending.value
          await send(pending.owner, pending.connectionId, latest).catch(() => {})
        }
      } finally { stateSending = false }
    })()
  }
  const received = async (owner: Attachment, event: AuthoringClientEvent) => {
    if (closed || attached !== owner) return
    if (event.type === 'connected') {
      active?.controller.abort(); active = undefined
      owner.connectionId = event.connectionId
      const value = snapshot()
      if (value) publishState(owner, event.connectionId, value)
      return
    }
    if (event.type === 'cancel') { if (event.connectionId === owner.connectionId && event.requestId === active?.requestId) active.controller.abort(); return }
    const request = event.request, connectionId = owner.connectionId
    if (!connectionId || request.clientId !== clientId || request.epoch !== owner.epoch || request.expectedClientState.connectionId !== connectionId || seen.has(request.requestId)) return
    seen.add(request.requestId)
    if (seen.size > 64) seen.delete(seen.values().next().value!)
    const value = snapshot()
    if (!value) return
    const controller = new AbortController(), task = { requestId: request.requestId, controller }
    const owned = () => {
      controller.signal.throwIfAborted()
      if (closed || attached !== owner || owner.connectionId !== connectionId || active !== task || Date.now() >= Date.parse(event.expiresAt)) throw new Error('client-request-expired')
    }
    if (active || value.revision !== request.expectedClientState.revision || !sameSource(value.source, request.source) || !value.actions.includes(request.action.type) || Date.now() >= Date.parse(event.expiresAt)) {
      await send(owner, connectionId, value, { requestId: request.requestId, state: 'refused', error: { code: 'client-state-changed' } }).catch(() => {})
      return
    }
    active = task
    const expiresAt = Date.parse(event.expiresAt)
    const timeout = setTimeout(() => controller.abort(new Error('client-request-expired')), Math.max(0, expiresAt - Date.now()))
    try {
      // Only a confirmed executing acknowledgement grants this epoch permission to invoke a control.
      await send(owner, connectionId, value, { requestId: request.requestId, state: 'executing' })
      owned()
      const latest = snapshot()
      if (!latest || latest.revision !== request.expectedClientState.revision || !sameSource(latest.source, request.source)) throw new Error('client-state-changed')
      const fits = (result: AuthoringClientActionResult) => authoringClientResultFits({ request, connection: { clientId, epoch: owner.epoch, connectionId }, document: owner.directory, snapshot: snapshot() ?? value }, result)
      const actionResult = await workbench.executeAuthoringClientAction(request.action, request.source, controller.signal, expiresAt, fits)
      owned()
      const result = snapshot()
      if (!result) throw new Error('client-document-changed')
      await send(owner, connectionId, result, { requestId: request.requestId, state: 'done', ...actionResult ? { result: actionResult } : {} }, actionResult ? () => {
        owned()
        const latest = snapshot()
        if (!latest || latest.revision !== result.revision || !['component-drafts.restore', 'component-drafts.discard'].includes(actionResult.type) && latest.revision !== request.expectedClientState.revision) throw new Error(actionResult.family === 'component' ? 'client-component-drafts-changed' : 'client-comment-drafts-changed')
        if (!fits(actionResult)) throw new Error(actionResult.family === 'component' ? 'client-component-result-too-large' : 'client-comment-result-too-large')
      } : undefined)
    } catch (error) {
      const result = snapshot()
      const code = error instanceof Error && /^(client|production)-[a-z-]{1,100}$/.test(error.message) ? error.message : 'client-action-not-verified'
      if (!controller.signal.aborted && attached === owner && owner.connectionId === connectionId && result) await send(owner, connectionId, result, { requestId: request.requestId, state: 'failed', error: { code } }).catch(() => {})
    } finally { clearTimeout(timeout); if (active === task) active = undefined }
  }
  const changed = () => {
    const state = workbench.state, source = state.authoring
    if (closed || state.document === undefined || !source?.identity || source.loading) { detach(); return }
    const before = revision, value = snapshot()
    if (!value) { detach(); return }
    if (attached && (attached.directory !== state.document || attached.identity !== source.identity)) detach()
    if (!attached) {
      const epoch = crypto.randomUUID()
      // Callbacks run after the channel has been installed; the socket implementation is asynchronous.
      const owner = { directory: state.document, identity: source.identity, epoch } as Attachment
      owner.channel = open(state.document, { clientId, epoch, snapshot: value }, event => { void received(owner, event) }, () => {
        if (attached === owner) { owner.connectionId = undefined; active?.controller.abort(); active = undefined }
      })
      attached = owner
    } else if (before !== revision && attached.connectionId) publishState(attached, attached.connectionId, value)
  }
  const stop = workbench.subscribe(changed)
  const stopDrafts = workbench.subscribeAuthoringDraftChanges(changed)
  changed()
  return () => { closed = true; stop(); stopDrafts(); detach() }
}
