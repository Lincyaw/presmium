import type { SyncTransports } from '@presmium/host'
import { addSyncMethod } from '@slidev/client'
import { drawingsIn, drawingsOut, sharedOut, sharedReceiver, slideSections } from '../domain/index.ts'
import type { SlideSections } from '../domain/index.ts'
import { sharedStates } from './shared.ts'

type SlidevSync = Parameters<typeof addSyncMethod>[0]
type State = Record<string, unknown>

const NAVIGATION = ' - shared'
const DRAWINGS = ' - drawings'

function translation(channel: string, sections: () => SlideSections): { out(state: State): State, in(patch: State): State } {
  if (channel.endsWith(NAVIGATION)) return { out: state => sharedOut(state, sections()), in: sharedReceiver(sections) }
  if (channel.endsWith(DRAWINGS)) return { out: state => drawingsOut(state, sections()), in: patch => drawingsIn(patch, sections()) }
  return { out: state => state, in: patch => patch }
}

export function createSyncTransports(sections?: () => SlideSections): SyncTransports {
  const none = slideSections([])
  const slides = sections ?? (() => none)
  return {
    add(transport) {
      let attached = true
      const sync: SlidevSync = {
        init(channel, onUpdate, state, persist) {
          if (!attached) return undefined
          const { out, in: received } = translation(channel, slides)
          const receive = (patch: State) => {
            if (attached) onUpdate(received(patch) as Parameters<typeof onUpdate>[0])
          }
          const publish = transport.connect(channel, receive, out(state as State), persist ?? false)
          if (!publish) return undefined
          return (next, updating) => {
            if (attached) publish(out(next as State), updating ?? false)
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
