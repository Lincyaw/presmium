import type { SharedStateScope, SyncPublish, SyncTransport, SyncTransports } from '@presmium/host'
import type { Ref } from 'vue'
import { effectScope, ref, toRaw, watch } from 'vue'

/** A 'remote' shared state as a sync channel: its state is `{ value }`. */
interface Channel {
  name: string
  receive(patch: Record<string, unknown>): void
  value(): unknown
  publishers: Map<SyncTransport, SyncPublish>
}

export interface SharedStates {
  sharedState<T>(key: string, initial: T, scope: SharedStateScope): Ref<T>
  /** The `syncTransports` service: transports join the 'remote' shared states. */
  transports: SyncTransports
}

const plain = (value: unknown): unknown => value === undefined ? undefined : JSON.parse(JSON.stringify(toRaw(value)))

/**
 * Shared states of the web form (`useSharedState`). 'local' and 'remote'
 * states travel between the deck's windows in this browser over a
 * BroadcastChannel; 'remote' ones are also sync channels that each transport
 * added through `transports` joins (e.g. a classroom), as Slidev's are in the
 * slides form. A change that came from another window or device is applied
 * here without being sent on again.
 */
export function createSharedStates(deck: string): SharedStates {
  const states = new Map<string, Ref<unknown>>()
  const channels = new Map<string, Channel>()
  const transports = new Set<SyncTransport>()
  // A state outlives the component that asked for it first.
  const detached = effectScope(true)

  const connect = (transport: SyncTransport, channel: Channel) => {
    const publish = transport.connect(channel.name, channel.receive, { value: channel.value() }, false)
    if (publish) channel.publishers.set(transport, publish)
  }

  function create(id: string, initial: unknown, scope: SharedStateScope): Ref<unknown> {
    const state = ref(plain(initial))
    if (scope === 'view' || typeof BroadcastChannel === 'undefined') return state
    const name = `presmium.shared:${deck}:${id}`
    const windows = new BroadcastChannel(name)
    let from: 'window' | 'remote' | undefined
    const apply = (value: unknown, source: 'window' | 'remote') => {
      from = source
      state.value = value
      from = undefined
    }
    windows.onmessage = (event: MessageEvent<unknown>) => apply(event.data, 'window')
    const channel: Channel = {
      name,
      receive(patch) {
        if ('value' in patch) apply(patch.value, 'remote')
      },
      value: () => plain(state.value),
      publishers: new Map(),
    }
    watch(state, (value) => {
      const data = plain(value)
      if (from === undefined) windows.postMessage(data)
      channel.publishers.forEach(publish => publish({ value: data }, from !== undefined))
    }, { deep: true, flush: 'sync' })
    if (scope === 'remote') {
      channels.set(id, channel)
      transports.forEach(transport => connect(transport, channel))
    }
    return state
  }

  return {
    sharedState<T>(key: string, initial: T, scope: SharedStateScope): Ref<T> {
      const id = `${scope}:${key}`
      let state = states.get(id)
      if (!state) {
        state = detached.run(() => create(id, initial, scope))!
        states.set(id, state)
      }
      return state as Ref<T>
    },
    transports: {
      add(transport) {
        transports.add(transport)
        channels.forEach(channel => connect(transport, channel))
        return () => {
          transports.delete(transport)
          channels.forEach(channel => channel.publishers.delete(transport))
        }
      },
    },
  }
}
