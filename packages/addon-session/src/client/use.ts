import { useService } from '@presmium/host'
import { SESSION } from '@presmium/kernel'
import type { Ref } from 'vue'
import { computed, shallowRef, watchEffect } from 'vue'
import { isClassroomSession } from '../domain/index.ts'
import type { ClassroomSession, ClassroomSnapshot } from '../domain/index.ts'

/** The session service of this plugin and its live snapshot; both undefined until the kernel has started. */
export function useClassroom(): { session: Readonly<Ref<ClassroomSession | undefined>>, snapshot: Readonly<Ref<ClassroomSnapshot | undefined>> } {
  const service = useService(SESSION)
  const session = computed(() => (isClassroomSession(service.value) ? service.value : undefined))
  const snapshot = shallowRef<ClassroomSnapshot>()
  watchEffect((onCleanup) => {
    const current = session.value
    snapshot.value = current?.snapshot()
    if (current) onCleanup(current.subscribe(next => snapshot.value = next))
  })
  return { session, snapshot }
}

/** Instances of the toolbar item; the first one shows the learner's badge, so a window has one. */
const owners = shallowRef<symbol[]>([])

export function claimBadge(): { owns: Readonly<Ref<boolean>>, release(): void } {
  const token = Symbol('badge')
  owners.value = [...owners.value, token]
  return {
    owns: computed(() => owners.value[0] === token),
    release: () => owners.value = owners.value.filter(t => t !== token),
  }
}
