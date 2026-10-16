import { useSessionSnapshot } from '@presmium/host'
import type { Ref } from 'vue'
import { computed } from 'vue'
import { isClassroomSession } from '../domain/index.ts'
import type { ClassroomSession, ClassroomSnapshot } from '../domain/index.ts'

/**
 * The session service of this plugin and its live snapshot, from the host's
 * (`useSessionSnapshot`); both undefined until the kernel has started, or
 * when another plugin provides the session.
 */
export function useClassroom(): { session: Readonly<Ref<ClassroomSession | undefined>>, snapshot: Readonly<Ref<ClassroomSnapshot | undefined>> } {
  const host = useSessionSnapshot()
  const session = computed(() => (isClassroomSession(host.session.value) ? host.session.value : undefined))
  const snapshot = computed(() => (session.value ? host.snapshot.value as ClassroomSnapshot | undefined : undefined))
  return { session, snapshot }
}

/**
 * Takes the focus out of a form that is about to go away. An engine that does
 * not focus the button clicked (WebKit) leaves it on the form's input, which
 * keeps it once removed: the hosts' shortcuts (Slidev's arrow keys) would
 * still see the reader typing.
 */
export function releaseFocus(): void {
  const active = document.activeElement
  if (active instanceof HTMLElement) active.blur()
}
