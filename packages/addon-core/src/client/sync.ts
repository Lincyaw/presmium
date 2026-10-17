import type { SyncTransports } from '@presmium/host'
import { addSyncMethod } from '@slidev/client'
import { drawingsIn, drawingsOut, sharedOut, sharedReceiver, slideSections } from '../domain/index.ts'
import type { SlideSections } from '../domain/index.ts'
import { sharedStates } from './shared.ts'

type SlidevSync = Parameters<typeof addSyncMethod>[0]
type State = Record<string, unknown>

/** Slidev's channels of the navigation (`<title> - shared`) and of the drawings (`<title> - drawings`). */
const SHARED = ' - shared'
const DRAWINGS = ' - drawings'

/**
 * How a channel's state goes out to a transport and comes in from it. What
 * Slidev keys by slide number and click goes by ids (D-4): the full and the
 * student build number their slides and clicks apart, so a learner of one
 * follows a presenter of the other to the same slide and click, and sees the
 * drawings there.
 */
function translation(channel: string, sections: () => SlideSections): { out(state: State): State, in(patch: State): State } {
  if (channel.endsWith(SHARED)) return { out: state => sharedOut(state, sections()), in: sharedReceiver(sections) }
  if (channel.endsWith(DRAWINGS)) return { out: state => drawingsOut(state, sections()), in: patch => drawingsIn(patch, sections()) }
  return { out: state => state, in: patch => patch }
}

/**
 * The `syncTransports` service: joins a `SyncTransport` to Slidev's synchronized
 * state (navigation, drawings) through `addSyncMethod`, and to the 'remote'
 * shared states. Slidev cannot remove a sync method, so a detached transport
 * is muted there instead. `sections` are the deck's slides by section
 * (`useSlideSections`); without them states go by slide number.
 */
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
