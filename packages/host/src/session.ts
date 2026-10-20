import { SESSION } from '@lincyaw/kernel'
import type { SessionService, SessionSnapshot } from '@lincyaw/kernel'
import type { ComputedRef, Ref } from 'vue'
import { computed, getCurrentScope, onScopeDispose, shallowRef, watchEffect } from 'vue'
import { useService } from './host.ts'

export function useSessionSnapshot(): { session: ComputedRef<SessionService | undefined>, snapshot: Readonly<Ref<SessionSnapshot | undefined>> } {
  const session = useService(SESSION)
  const snapshot = shallowRef<SessionSnapshot>()
  watchEffect((onCleanup) => {
    const current = session.value
    snapshot.value = current?.snapshot()
    if (current) onCleanup(current.subscribe(next => snapshot.value = next))
  })
  return { session, snapshot }
}

const groups = new Map<string, Ref<symbol[]>>()

export function claimFirst(group: string): { owns: Readonly<Ref<boolean>>, release(): void } {
  let owners = groups.get(group)
  if (!owners) {
    owners = shallowRef<symbol[]>([])
    groups.set(group, owners)
  }
  const list = owners
  const token = Symbol(group)
  list.value = [...list.value, token]
  const release = () => {
    list.value = list.value.filter(t => t !== token)
  }
  if (getCurrentScope()) onScopeDispose(release)
  return { owns: computed(() => list.value[0] === token), release }
}
