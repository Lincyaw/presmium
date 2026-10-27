import { PREVIEW_EVENTS_PARAM, previewEnvelope } from './contracts/preview.ts'
import type { PreviewCommand, PreviewEventSubscription, PreviewEventTarget, PreviewEventMessage } from './contracts/preview.ts'
import { previewNonce } from './preview-frame.ts'

/** Uses the existing preview-ready handshake, origin fence and nonce; never opens a network connection. */
export interface PreviewEvents {
  connection: string
  subscribe: PreviewEventSubscription
  receive(command: Extract<PreviewCommand, { type: 'events-ready' | 'events-message' }>): void
  stop(): void
}

export function createPreviewEvents(origins: readonly string[], document: string): PreviewEvents | undefined {
  if (typeof window === 'undefined' || window.parent === window || !origins.length || new URL(location.href).searchParams.get(PREVIEW_EVENTS_PARAM) !== 'shared') return
  const nonce = previewNonce()
  if (!nonce) return
  const connection = crypto.randomUUID()
  const readers = new Map<string, { target: PreviewEventTarget, received(message: PreviewEventMessage): void }>()
  let ready = false, stopped = false, parked = false
  const post = (message: Parameters<typeof previewEnvelope>[1]) => {
    if (!stopped) for (const origin of origins) window.parent.postMessage(previewEnvelope(nonce, message), origin)
  }
  const subscribe = (id: string, target: PreviewEventTarget) => post({ type: 'events-subscribe', connection, id, target })
  const park = () => {
    parked = true
    for (const id of readers.keys()) post({ type: 'events-unsubscribe', connection, id })
  }
  const resume = () => {
    parked = false
    if (ready) for (const [id, reader] of readers) subscribe(id, reader.target)
  }
  window.addEventListener('pagehide', park)
  window.addEventListener('pageshow', resume)
  return {
    connection,
    subscribe(target, received) {
      if (stopped || target.document !== document) return () => {}
      const id = crypto.randomUUID()
      readers.set(id, { target, received })
      if (ready && !parked) subscribe(id, target)
      return () => { if (readers.delete(id)) post({ type: 'events-unsubscribe', connection, id }) }
    },
    receive(command) {
      if (stopped || command.connection !== connection) return
      if (command.type === 'events-ready') {
        if (ready) return
        ready = true
        if (!parked) for (const [id, reader] of readers) subscribe(id, reader.target)
      } else if (!parked) readers.get(command.id)?.received(command.message)
    },
    stop() {
      park(); readers.clear(); stopped = true
      window.removeEventListener('pagehide', park)
      window.removeEventListener('pageshow', resume)
    },
  }
}
