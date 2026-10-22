import type { Ref } from 'vue'
import { computed, getCurrentScope, onScopeDispose, shallowRef } from 'vue'

const groups = new Map<string, Ref<symbol[]>>()

/** Whether this instance is the first live one of its group, e.g. the one toolbar badge among several copies. */
export function claimFirst(group: string): { owns: Readonly<Ref<boolean>>, release(): void } {
  let owners = groups.get(group)
  if (!owners) {
    owners = shallowRef<symbol[]>([])
    groups.set(group, owners)
  }
  const list = owners
  const claim = Symbol(group)
  list.value = [...list.value, claim]
  const release = () => {
    list.value = list.value.filter(other => other !== claim)
  }
  if (getCurrentScope()) onScopeDispose(release)
  return { owns: computed(() => list.value[0] === claim), release }
}
