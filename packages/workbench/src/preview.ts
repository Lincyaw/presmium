/**
 * The workbench's side of the preview protocol v1 (docs/design-dsh.md 4.2 and
 * 4.5): a product page in an iframe, from the workspace service's origin. Its
 * address gets the iframe's own nonce (`presmium-preview=<nonce>`); a message
 * counts only when it comes from that origin, from that iframe's window and
 * with that nonce, and commands go to that origin only. Commands wait for the
 * page's `ready`: the last one of each kind is sent then, and again after the
 * page loads anew (the agent keeps the nonce across reloads).
 */
import { isPreviewEnvelope, PREVIEW_PARAM, PREVIEW_PROTOCOL, previewEnvelope, readPreviewReport } from '@presmium/kernel'
import type { PreviewCommand, PreviewReport } from '@presmium/kernel'

export interface PreviewHandlers {
  report(report: PreviewReport): void
  /** The page speaks another version of the protocol. */
  mismatch?(version: number): void
}

export interface PreviewConnection {
  /** The address the iframe loads: the preview's, with the nonce. */
  readonly src: string
  readonly nonce: string
  /** The page has said `ready` (a page loaded anew says it again, and gets the last commands again). */
  readonly ready: boolean
  send(command: PreviewCommand): void
  dispose(): void
}

/** A random nonce for one iframe. */
function nonce(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`
}

/** Connects to the page `address` will load in `frame` (the caller sets `frame.src` to `src`). */
export function connectPreview(frame: () => HTMLIFrameElement | null, address: string, handlers: PreviewHandlers): PreviewConnection {
  const url = new URL(address)
  const own = nonce()
  url.searchParams.set(PREVIEW_PARAM, own)
  const origin = url.origin
  /** The last command of each kind, sent at `ready`. */
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
