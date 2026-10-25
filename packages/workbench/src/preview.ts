import { isPreviewEnvelope, PREVIEW_APPEARANCE_PARAM, PREVIEW_PARAM, PREVIEW_PROTOCOL, previewEnvelope, toPreviewReport } from '@lincyaw/kernel'
import type { PreviewCommand, PreviewCommandType, PreviewReport } from '@lincyaw/kernel'

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

/** `dark`: the workbench's appearance as the page loads, which its first paint takes (the `appearance` command follows it). */
export function connectPreview(frame: () => HTMLIFrameElement | null, address: string, handlers: PreviewHandlers, options: { dark?: boolean } = {}): PreviewConnection {
  const url = new URL(address)
  const own = nonce()
  url.searchParams.set(PREVIEW_PARAM, own)
  if (options.dark !== undefined) url.searchParams.set(PREVIEW_APPEARANCE_PARAM, options.dark ? 'dark' : 'light')
  const origin = url.origin
  const latest = new Map<string, PreviewCommand>()
  const transient = new Set<PreviewCommand['type']>(['page-insert', 'flush', 'pause-playback', 'playback-granted', 'document-history', 'document-history-reset', 'blocks-result', 'source-result', 'source-saved', 'source-created', 'page-created'])
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
      generation++
      ready = true
      capabilities = Object.freeze([...report.capabilities])
      for (const command of latest.values()) {
        post(command)
        if (oneShot(command)) latest.delete(command.type)
      }
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
      // Queue a mutation until the first ready report, but never replay it after a reload.
      if (!oneShot(command) || !ready) latest.set(command.type, command)
      if (ready) post(command)
    },
    dispose() {
      window.removeEventListener('message', listener)
    },
  }
}
