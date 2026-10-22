import type { ClassroomStore } from '@lincyaw/kernel'
import type * as Y from 'yjs'
import { jsonClone } from '../domain/index.ts'
import { collection, observe } from './ydoc.ts'

export interface YjsStore {
  store: ClassroomStore
  /** Observes the collections of the current document and tells every listener. */
  rebind(): void
}

export function createYjsStore(doc: () => Y.Doc, checkWrite: () => void): YjsStore {
  const listeners = new Map<string, Set<() => void>>()
  let detach: (() => void)[] = []
  const attach = (name: string) => detach.push(observe(collection(doc(), name), () => listeners.get(name)?.forEach(listener => listener())))
  return {
    store: {
      list: <T>(name: string) => [...collection(doc(), name).entries()].map(([id, value]) => ({ id, value: value as T })),
      get: <T>(name: string, id: string) => collection(doc(), name).get(id) as T | undefined,
      put(name, id, value) {
        checkWrite()
        collection(doc(), name).set(id, jsonClone(value))
      },
      remove(name, id) {
        checkWrite()
        collection(doc(), name).delete(id)
      },
      subscribe(name, listener) {
        let set = listeners.get(name)
        if (!set) {
          listeners.set(name, set = new Set())
          attach(name)
        }
        set.add(listener)
        return () => {
          set.delete(listener)
        }
      },
    },
    rebind() {
      detach.forEach(stop => stop())
      detach = []
      for (const name of listeners.keys()) attach(name)
      listeners.forEach(set => set.forEach(listener => listener()))
    },
  }
}
