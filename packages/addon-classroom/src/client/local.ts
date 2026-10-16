import type { ClassroomStore } from '@presmium/kernel'

type Data = Record<string, Record<string, unknown>>

function localStorageOrNone(): Storage | undefined {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

/**
 * A `ClassroomStore` in the browser's `localStorage` under one key, for what
 * a reader keeps outside a classroom (notes, predictions). Other tabs of the
 * deck see the changes. Without storage (private mode, blocked) it keeps
 * nothing.
 */
export function createBrowserStore(key: string, storage = localStorageOrNone()): ClassroomStore {
  const listeners = new Map<string, Set<() => void>>()
  const notify = (name?: string) => (name ? [listeners.get(name)] : [...listeners.values()]).forEach(set => set?.forEach(listener => listener()))
  const read = (): Data => {
    try {
      return JSON.parse(storage?.getItem(key) ?? '{}') as Data ?? {}
    } catch {
      return {}
    }
  }
  const change = (name: string, apply: (items: Record<string, unknown>) => void) => {
    const data = read()
    const items = data[name] ?? {}
    apply(items)
    data[name] = items
    try {
      storage?.setItem(key, JSON.stringify(data))
    } catch {}
    notify(name)
  }
  window.addEventListener('storage', (event) => {
    if (event.key === key) notify()
  })
  return {
    list: <T>(name: string) => Object.entries(read()[name] ?? {}).map(([id, value]) => ({ id, value: value as T })),
    get: <T>(name: string, id: string) => read()[name]?.[id] as T | undefined,
    put(name, id, value) {
      change(name, items => items[id] = JSON.parse(JSON.stringify(value)))
    },
    remove(name, id) {
      change(name, items => delete items[id])
    },
    subscribe(name, listener) {
      let set = listeners.get(name)
      if (!set) listeners.set(name, set = new Set())
      set.add(listener)
      return () => {
        set.delete(listener)
      }
    },
  }
}

/**
 * Two stores as one: writes go to both, reads see the items of both (`first`
 * wins for an id in both), and a change in either is a change.
 */
export function bothStores(first: ClassroomStore, second: ClassroomStore): ClassroomStore {
  return {
    list<T>(name: string) {
      const items = new Map(second.list<T>(name).map(item => [item.id, item]))
      for (const item of first.list<T>(name)) items.set(item.id, item)
      return [...items.values()]
    },
    get: <T>(name: string, id: string) => first.get<T>(name, id) ?? second.get<T>(name, id),
    put(name, id, value) {
      second.put(name, id, value)
      first.put(name, id, value)
    },
    remove(name, id) {
      second.remove(name, id)
      first.remove(name, id)
    },
    subscribe(name, listener) {
      const stops = [first.subscribe(name, listener), second.subscribe(name, listener)]
      return () => stops.forEach(stop => stop())
    },
  }
}

let kept: ClassroomStore | undefined

/** What this browser keeps of a deck (its base URL): the reader's notes and predictions. */
export function browserStore(): ClassroomStore {
  kept ??= createBrowserStore(`presmium.classroom:${new URL(import.meta.env.BASE_URL, location.href).pathname}`)
  return kept
}
