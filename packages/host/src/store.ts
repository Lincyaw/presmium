import { useSyncExternalStore } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { Unsubscribe } from '@lincyaw/kernel/contracts'

/** Framework-independent, synchronous state shared by playback, the viewer and React bindings. */
export interface Store<T> {
  getSnapshot(): T
  subscribe(listener: () => void): Unsubscribe
  set: Dispatch<SetStateAction<T>>
}
export function createStore<T>(initial: T): Store<T> {
  let value = initial
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => value,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener) } },
    set(next) {
      const changed = typeof next === 'function' ? (next as (before: T) => T)(value) : next
      if (Object.is(changed, value)) return
      value = changed
      for (const listener of [...listeners]) listener()
    },
  }
}
const idleSubscribe = () => () => {}
export function useStore<T>(store: Store<T> | undefined, fallback?: T): T {
  return useSyncExternalStore(store?.subscribe ?? idleSubscribe, store?.getSnapshot ?? (() => fallback as T), store?.getSnapshot ?? (() => fallback as T))
}
export function observe<T>(store: Store<T>, listener: (value: T, before: T) => void, immediate = false): Unsubscribe {
  let before = store.getSnapshot()
  if (immediate) listener(before, before)
  return store.subscribe(() => { const value = store.getSnapshot(); const previous = before; before = value; listener(value, previous) })
}
