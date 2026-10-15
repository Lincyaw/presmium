import { joinWindows } from '@presmium/host'
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
 * The windows of the deck in this browser (`joinWindows`). Slidev's sync of a
 * build sends each change of a channel to the windows open at the time; here
 * a window opened later gets the shared states that changed before. In dev,
 * Slidev syncs its own channels through the dev server, which other channels
 * cannot join, so the changes themselves travel here too.
 */
const browserWindows: SlidevSync = {
  init(channel, onUpdate, state) {
    if (!channel.startsWith(PREFIX)) return undefined
    let changed = false
    const windows = joinWindows(`${channel} (windows)`, value => onUpdate(value as Partial<typeof state>), () => changed ? toRaw(state) : undefined)
    return (next, updating) => {
      changed = true
      if (mode === 'dev' && !updating) windows?.send(toRaw(next))
    }
  },
}

const states = new Map<string, Ref<unknown>>()
// A state outlives the component that asked for it first.
const detached = effectScope(true)
let joined = false

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
  if (!joined) {
    joined = true
    addSyncMethod(browserWindows)
  }
  const sync = createSyncState<{ value: T }>({ value: structuredClone(initial) }, { value: structuredClone(initial) })
  sync.init(`${PREFIX}${id}`)
  return computed({
    get: () => sync.state.value,
    set: value => sync.patch('value', value as T),
  })
}
