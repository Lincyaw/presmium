import type { SyncTransports } from '@presmium/host'
import { addSyncMethod } from '@slidev/client'
import { sharedStates } from './shared.ts'

type SlidevSync = Parameters<typeof addSyncMethod>[0]

/**
 * The `syncTransports` service: joins a `SyncTransport` to Slidev's synchronized
 * state (navigation, drawings) through `addSyncMethod`, and to the 'remote'
 * shared states. Slidev cannot remove a sync method, so a detached transport
 * is muted there instead.
 */
export function createSyncTransports(): SyncTransports {
  return {
    add(transport) {
      let attached = true
      const sync: SlidevSync = {
        init(channel, onUpdate, state, persist) {
          if (!attached) return undefined
          const receive = (patch: Record<string, unknown>) => {
            if (attached) onUpdate(patch as Parameters<typeof onUpdate>[0])
          }
          const publish = transport.connect(channel, receive, state as Record<string, unknown>, persist ?? false)
          if (!publish) return undefined
          return (next, updating) => {
            if (attached) publish(next as Record<string, unknown>, updating ?? false)
          }
        },
      }
      addSyncMethod(sync)
      const detach = sharedStates.transports.add(transport)
      return () => {
        attached = false
        detach()
      }
    },
  }
}
