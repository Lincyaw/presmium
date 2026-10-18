import type { Ref } from 'vue'
import { effectScope, ref, toRaw, watch } from 'vue'
import type { SharedStateScope, SyncPublish, SyncTransport, SyncTransports } from './types.ts'
import { joinWindows } from './windows.ts'

interface Channel {
  name: string
  receive(patch: Record<string, unknown>): void
  value(): unknown
  publishers: Map<SyncTransport, SyncPublish>
}

export interface SharedStates {
  sharedState<T>(key: string, initial: T, scope: SharedStateScope): Ref<T>
  transports: SyncTransports
}

const plain = (value: unknown): unknown => value === undefined ? undefined : JSON.parse(JSON.stringify(toRaw(value)))

export function createSharedStates(deck: string): SharedStates {
  const states = new Map<string, Ref<unknown>>()
  const channels = new Map<string, Channel>()
  const transports = new Set<SyncTransport>()
  const detached = effectScope(true)

  const connect = (transport: SyncTransport, channel: Channel) => {
    const publish = transport.connect(channel.name, channel.receive, { value: channel.value() }, false)
    if (publish) channel.publishers.set(transport, publish)
  }

  function create(id: string, initial: unknown, scope: SharedStateScope): Ref<unknown> {
    const state = ref(plain(initial))
    if (scope === 'view') return state
    const name = `presmium.shared:${deck}:${id}`
    let from: 'window' | 'remote' | undefined
    let changed = false
    const apply = (value: unknown, source: 'window' | 'remote') => {
      from = source
      state.value = value
      from = undefined
    }
    const windows = joinWindows(name, value => apply(value, 'window'), () => changed ? plain(state.value) : undefined)
    const channel: Channel = {
      name,
      receive(patch) {
        if ('value' in patch) apply(patch.value, 'remote')
      },
      value: () => plain(state.value),
      publishers: new Map(),
    }
    watch(state, (value) => {
      changed = true
      const data = plain(value)
      if (from === undefined) windows?.send(data)
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
