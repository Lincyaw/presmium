import { createStore } from './store.ts'
import type { Store } from './store.ts'
const groups = new Map<string, Store<symbol[]>>()
export function claimFirst(group: string): { owns: Store<boolean>, release(): void } {
  let owners = groups.get(group)
  if (!owners) { owners = createStore<symbol[]>([]); groups.set(group, owners) }
  const list = owners
  const claim = Symbol(group)
  list.set([...list.getSnapshot(), claim])
  const owns = createStore(list.getSnapshot()[0] === claim)
  const stop = list.subscribe(() => owns.set(list.getSnapshot()[0] === claim))
  return { owns, release() { stop(); list.set(list.getSnapshot().filter(other => other !== claim)) } }
}
