import type { SyncTransport } from '@lincyaw/host'
import type * as Y from 'yjs'
import { jsonClone } from '../domain/index.ts'
import { channel, observe, writeChannel } from './ydoc.ts'

interface Link {
  receive(patch: Record<string, unknown>): void
  state: Readonly<Record<string, unknown>>
}

export interface SyncChannelRoles {
  /** This window takes the presenter's state of the channels. */
  following(): boolean
  /** This window writes its state of the channels for the others. */
  publishing(): boolean
}

/** The host's sync channels (shared state, Slidev's sync) carried through the classroom document. */
export interface SyncChannels {
  transport: SyncTransport
  /** Observes the channels of the current document. */
  rebind(): void
  /** Gives a following window the presenter's state of every channel. */
  deliver(): void
  /** Writes this window's state of every channel. */
  publishAll(): void
}

export function createSyncChannels(doc: () => Y.Doc, roles: SyncChannelRoles): SyncChannels {
  const links = new Map<string, Link>()
  let detach: (() => void)[] = []

  function attach(name: string, link: Link): void {
    const map = channel(doc(), name)
    detach.push(observe(map, (event, transaction) => {
      if (transaction.local || !roles.following()) return
      link.receive(Object.fromEntries([...event.keysChanged].map(key => [key, jsonClone(map.get(key))])))
    }))
  }

  return {
    transport: {
      connect(name, receive, state) {
        const link: Link = { receive, state }
        links.set(name, link)
        attach(name, link)
        const current = channel(doc(), name).toJSON()
        if (roles.following() && Object.keys(current).length > 0) receive(current)
        return (next, fromRemote) => {
          link.state = next
          if (!fromRemote && roles.publishing()) writeChannel(doc(), name, next)
        }
      },
    },
    rebind() {
      detach.forEach(stop => stop())
      detach = []
      for (const [name, link] of links) attach(name, link)
    },
    deliver() {
      if (!roles.following()) return
      for (const [name, link] of links) {
        const state = channel(doc(), name).toJSON()
        if (Object.keys(state).length > 0) link.receive(state)
      }
    },
    publishAll() {
      for (const [name, link] of links) writeChannel(doc(), name, link.state)
    },
  }
}
