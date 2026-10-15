import type { SharedStateScope } from '@presmium/host'
import { addSyncMethod, createSyncState, mode, slidesTitle } from '@slidev/client'
import type { Ref } from 'vue'
import { computed, effectScope, ref, toRaw } from 'vue'

/**
 * Shared states of the slides form (`useSharedState`): Slidev sync channels
 * (`createSyncState`), so they travel between the deck's windows as its
 * navigation does, and, for the 'remote' scope, through the sync transports
 * joined with `addSyncMethod` (see ./sync.ts, which keeps transports off the
 * 'local' channels). 'view' states stay in the window.
 */
const PREFIX = `${slidesTitle} - presmium-shared:`

/** Whether a sync channel holds a shared state limited to this browser. */
export function isLocalChannel(channel: string): boolean {
  return channel.startsWith(`${PREFIX}local:`)
}

type SlidevSync = Parameters<typeof addSyncMethod>[0]

/**
 * In dev, Slidev syncs its own channels through the dev server, which other
 * channels cannot join; the shared states join the windows of one browser instead.
 */
const browserWindows: SlidevSync = {
  init(channel, onUpdate) {
    if (!channel.startsWith(PREFIX)) return undefined
    const broadcast = new BroadcastChannel(`${channel} (dev)`)
    broadcast.onmessage = event => onUpdate(event.data)
    return (state, updating) => {
      if (!updating) broadcast.postMessage(toRaw(state))
    }
  },
}

const states = new Map<string, Ref<unknown>>()
// A state outlives the component that asked for it first.
const detached = effectScope(true)
let devSync = false

export function sharedState<T>(key: string, initial: T, scope: SharedStateScope): Ref<T> {
  const id = `${scope}:${key}`
  let state = states.get(id)
  if (!state) {
    state = detached.run(() => create(id, initial, scope))!
    states.set(id, state)
  }
  return state as Ref<T>
}

function create<T>(id: string, initial: T, scope: SharedStateScope): Ref<unknown> {
  if (scope === 'view') return ref(initial)
  if (mode === 'dev' && !devSync) {
    devSync = true
    addSyncMethod(browserWindows)
  }
  const sync = createSyncState<{ value: T }>({ value: structuredClone(initial) }, { value: structuredClone(initial) })
  sync.init(`${PREFIX}${id}`)
  return computed({
    get: () => sync.state.value,
    set: value => sync.patch('value', value as T),
  })
}
