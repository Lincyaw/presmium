import type { Membership } from './membership-storage.ts'

type TabMessage =
  | { type: 'who' }
  | { type: 'presenter', membership: Membership }
  | { type: 'left', room: string }

export interface TabHandlers {
  /** Another tab asks which tab of this browser presents. */
  asked(): void
  /** A tab of this browser presents with `membership`. */
  presenting(membership: Membership): void
  /** The tab that presented `room` left it. */
  left(room: string): void
}

/** The other tabs of this browser on the same deck: a presenter's other tabs watch the classroom as it does. */
export interface TabMirror {
  ask(): void
  announce(membership: Membership): void
  leave(room: string): void
  close(): void
}

export function connectTabs(name: string, handlers: TabHandlers): TabMirror {
  const tabs = typeof BroadcastChannel === 'undefined' ? undefined : new BroadcastChannel(name)
  const tell = (message: TabMessage) => tabs?.postMessage(message)
  if (tabs) {
    tabs.onmessage = ({ data }: MessageEvent<TabMessage>) => {
      if (data.type === 'who') handlers.asked()
      else if (data.type === 'presenter') handlers.presenting(data.membership)
      else if (data.type === 'left') handlers.left(data.room)
    }
  }
  return {
    ask: () => tell({ type: 'who' }),
    announce: membership => tell({ type: 'presenter', membership }),
    leave: room => tell({ type: 'left', room }),
    close: () => tabs?.close(),
  }
}
