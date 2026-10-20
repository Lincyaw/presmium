import { isPreviewEnvelope, PREVIEW_PARAM, PREVIEW_PROTOCOL, previewEnvelope, readPreviewReport } from '@lincyaw/kernel'
import type { PreviewCommand, PreviewReport } from '@lincyaw/kernel'

export interface PreviewHandlers {
  report(report: PreviewReport): void
  mismatch?(version: number): void
}

export interface PreviewConnection {
  readonly src: string
  readonly nonce: string
  readonly ready: boolean
  send(command: PreviewCommand): void
  dispose(): void
}

function nonce(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`
}

export function connectPreview(frame: () => HTMLIFrameElement | null, address: string, handlers: PreviewHandlers): PreviewConnection {
  const url = new URL(address)
  const own = nonce()
  url.searchParams.set(PREVIEW_PARAM, own)
  const origin = url.origin
  const latest = new Map<string, PreviewCommand>()
  let ready = false
  const post = (command: PreviewCommand) => frame()?.contentWindow?.postMessage(previewEnvelope(own, command), origin)
  const listener = (event: MessageEvent) => {
    const window_ = frame()?.contentWindow
    if (!window_ || event.source !== window_ || event.origin !== origin) return
    if (isPreviewEnvelope(event.data, own) && event.data.version !== PREVIEW_PROTOCOL) {
      handlers.mismatch?.(event.data.version)
      return
    }
    const report = readPreviewReport(event.data, own)
    if (!report) return
    if (report.type === 'ready') {
      ready = true
      for (const command of latest.values()) post(command)
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
    send(command) {
      latest.set(command.type, command)
      if (ready) post(command)
    },
    dispose() {
      window.removeEventListener('message', listener)
    },
  }
}
