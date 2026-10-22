import { SESSION } from '@lincyaw/kernel'
import type { SessionService, SessionSnapshot } from '@lincyaw/kernel'
import type { ComputedRef, Ref } from 'vue'
import { shallowRef, watchEffect } from 'vue'
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
