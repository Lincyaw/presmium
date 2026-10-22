import type { SyncTransports } from '@lincyaw/host'
import { addSyncMethod } from '@slidev/client'
import { createSharedStateIn, drawingsIn, drawingsOut, sharedStateOut, slideSections } from '../domain/index.ts'
import type { SlideSections } from '../domain/index.ts'
import { sharedStates } from './shared-states.ts'

type SlidevSync = Parameters<typeof addSyncMethod>[0]
type State = Record<string, unknown>

// Slidev's sync channels: its shared state (page, clicks, cursor) and its drawings.
const SHARED_STATE_CHANNEL = ' - shared'
const DRAWINGS_CHANNEL = ' - drawings'

function channelTranslation(channel: string, sections: () => SlideSections): { out(state: State): State, in(patch: State): State } {
  if (channel.endsWith(SHARED_STATE_CHANNEL)) return { out: state => sharedStateOut(state, sections()), in: createSharedStateIn(sections) }
  if (channel.endsWith(DRAWINGS_CHANNEL)) return { out: state => drawingsOut(state, sections()), in: patch => drawingsIn(patch, sections()) }
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
          const { out, in: received } = channelTranslation(channel, slides)
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
