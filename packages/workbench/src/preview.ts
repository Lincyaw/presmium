import { isPreviewEnvelope, PREVIEW_KEYS_PARAM, PREVIEW_PRESENTATION_PARAM, PREVIEW_EVENTS_PARAM, PREVIEW_APPEARANCE_PARAM, PREVIEW_PARAM, PREVIEW_PROTOCOL, previewEnvelope, toPreviewReport } from '@lincyaw/kernel'
import type { PreviewCommand, PreviewCommandType, PreviewReport, PreviewEventSubscription } from '@lincyaw/kernel'

export interface PreviewHandlers {
  report(report: PreviewReport): void
  mismatch?(version: number): void
}

export interface PreviewConnection {
  readonly src: string
  readonly nonce: string
  readonly ready: boolean
  readonly capabilities: readonly PreviewCommandType[]
  /** Changes when the same iframe reloads and completes a new handshake. */
  readonly generation?: number
  send(command: PreviewCommand): void
  dispose(): void
}

function nonce(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`
}

/**
 * `dark`: the workbench's appearance as the page loads, which its first paint takes (the `appearance` command follows it).
 * `playbackKeys`: the workbench plays the page, so the page sends it Space and the left and right arrows.
 */
export function connectPreview(frame: () => HTMLIFrameElement | null, address: string, handlers: PreviewHandlers, options: { dark?: boolean, presentation?: boolean, playbackKeys?: boolean, subscribeEvents?: PreviewEventSubscription } = {}): PreviewConnection {
  const url = new URL(address)
  const own = nonce()
  url.searchParams.set(PREVIEW_PARAM, own)
  if (options.dark !== undefined) url.searchParams.set(PREVIEW_APPEARANCE_PARAM, options.dark ? 'dark' : 'light')
  if (options.presentation) url.searchParams.set(PREVIEW_PRESENTATION_PARAM, 'confirmed')
  if (options.playbackKeys) url.searchParams.set(PREVIEW_KEYS_PARAM, 'playback')
  if (options.subscribeEvents) url.searchParams.set(PREVIEW_EVENTS_PARAM, 'shared')
  const boundDocument = url.searchParams.get('document') ?? ''
  const readers = new Map<string, { topic: string, stop(): void }>()
  let eventConnection: string | undefined
  const stopEvents = () => { for (const reader of readers.values()) reader.stop(); readers.clear() }
  const origin = url.origin
  const latest = new Map<string, PreviewCommand>()
  const replies = new Set<PreviewCommand['type']>(['edit-result', 'blocks-result', 'source-result', 'source-saved', 'source-created', 'page-created', 'playback-granted'])
  const transient = new Set<PreviewCommand['type']>(['page-insert', 'flush', 'pause-playback', 'playback-granted', 'production-playback', 'document-history', 'document-history-reset', 'events-message', 'events-ready', 'edit', 'edit-result', 'blocks-result', 'source-result', 'source-saved', 'source-created', 'page-created'])
  const oneShot = (command: PreviewCommand) => transient.has(command.type)
  let ready = false
  let generation = 0
  let capabilities: readonly PreviewCommandType[] = []
  const post = (command: PreviewCommand) => frame()?.contentWindow?.postMessage(previewEnvelope(own, command), origin)
  const listener = (event: MessageEvent) => {
    const window_ = frame()?.contentWindow
    if (!window_ || event.source !== window_ || event.origin !== origin) return
    if (isPreviewEnvelope(event.data, own) && event.data.version !== PREVIEW_PROTOCOL) {
      handlers.mismatch?.(event.data.version)
      return
    }
    const report = toPreviewReport(event.data, own)
    if (!report) return
    if (report.type === 'ready') {
      stopEvents()
      eventConnection = report.document === boundDocument ? report.eventConnection : undefined
      if (options.subscribeEvents && eventConnection) post({ type: 'events-ready', connection: eventConnection })
      generation++
      ready = true
      capabilities = Object.freeze([...report.capabilities])
      for (const command of latest.values()) {
        post(command)
        if (oneShot(command)) latest.delete(command.type)
      }
    }
    if (report.type === 'events-subscribe') {
      if (!options.subscribeEvents || report.connection !== eventConnection || report.target.document !== boundDocument || readers.has(report.id) || readers.size >= 2 || [...readers.values()].some(reader => reader.topic === report.target.topic)) return
      const entry = { topic: report.target.topic, stop: () => {} }
      readers.set(report.id, entry)
      entry.stop = options.subscribeEvents(report.target, message => {
        if (eventConnection === report.connection && readers.get(report.id) === entry) post({ type: 'events-message', connection: report.connection, id: report.id, message })
      })
      return
    }
    if (report.type === 'events-unsubscribe') {
      if (report.connection === eventConnection) { readers.get(report.id)?.stop(); readers.delete(report.id) }
      return
    }
    handlers.report(report)
  }
  window.addEventListener('message', listener)
  return {
    src: url.href,
    nonce: own,
    get ready() {
      return ready
    },
    get capabilities() {
      return capabilities
    },
    get generation() { return generation },
    send(command) {
      if (!ready && replies.has(command.type)) return
      // Queue a mutation until the first ready report, but never replay it after a reload.
      if (!oneShot(command) || !ready) latest.set(command.type, command)
      if (ready) post(command)
    },
    dispose() {
      stopEvents(); eventConnection = undefined
      ready = false
      generation++
      latest.clear()
      window.removeEventListener('message', listener)
    },
  }
}
