import { useSessionSnapshot } from '@lincyaw/host'
import type { Ref } from 'vue'
import { computed } from 'vue'
import { isClassroomSession } from '../domain/index.ts'
import type { ClassroomSession, ClassroomSnapshot } from '../domain/index.ts'

export function useClassroom(): { session: Readonly<Ref<ClassroomSession | undefined>>, snapshot: Readonly<Ref<ClassroomSnapshot | undefined>> } {
  const host = useSessionSnapshot()
  const session = computed(() => (isClassroomSession(host.session.value) ? host.session.value : undefined))
  const snapshot = computed(() => (session.value ? host.snapshot.value as ClassroomSnapshot | undefined : undefined))
  return { session, snapshot }
}

export function releaseFocus(): void {
  const active = document.activeElement
  if (active instanceof HTMLElement) active.blur()
}
