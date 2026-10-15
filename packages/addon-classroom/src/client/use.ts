import { useService } from '@presmium/host'
import { CLASSROOM_STORE, SESSION } from '@presmium/kernel'
import type { ClassroomStore, SessionSnapshot, StoredItem } from '@presmium/kernel'
import type { ComputedRef, Ref } from 'vue'
import { computed, shallowRef, watchEffect } from 'vue'
import { browserNotes } from './local.ts'

/** The `session` service and its live snapshot; `joined` while this window is in a classroom, active or ended. */
export function useSession() {
  const session = useService(SESSION)
  const snapshot = shallowRef<SessionSnapshot>()
  watchEffect((onCleanup) => {
    const current = session.value
    snapshot.value = current?.snapshot()
    if (current) onCleanup(current.subscribe(next => snapshot.value = next))
  })
  const me = computed(() => snapshot.value?.me)
  const status = computed(() => snapshot.value?.status ?? 'idle')
  const joined = computed(() => status.value !== 'idle' && me.value !== undefined)
  const presenter = computed(() => joined.value && me.value?.role === 'presenter')
  return { session, snapshot, me, status, joined, presenter }
}

/** The shared `classroomStore`; undefined until the kernel has started, or without a session plugin. */
export function useClassroomStore(): ComputedRef<ClassroomStore | undefined> {
  return useService(CLASSROOM_STORE)
}

/** The items of a collection of `store`, kept current as the store changes or is replaced. */
export function useCollection<T>(store: () => ClassroomStore | undefined, name: string): Readonly<Ref<StoredItem<T>[]>> {
  const items = shallowRef<StoredItem<T>[]>([])
  watchEffect((onCleanup) => {
    const current = store()
    const update = () => {
      items.value = current?.list<T>(name) ?? []
    }
    update()
    if (current) onCleanup(current.subscribe(name, update))
  })
  return items
}

/** Where this window's notes go: the participant's own store in a classroom, else the browser. */
export function useNotesStore(): ComputedRef<ClassroomStore> {
  const { session, joined } = useSession()
  return computed(() => (joined.value && session.value?.personal) || browserNotes())
}

/** Runs a write to a store; a refused write (e.g. after the classroom ended) becomes `failure`. */
export function useWrite() {
  const failure = shallowRef('')
  function write(action: () => void): boolean {
    failure.value = ''
    try {
      action()
      return true
    } catch (error) {
      failure.value = error instanceof Error ? error.message : String(error)
      return false
    }
  }
  return { failure, write }
}

/** An id for a new item: unique enough within one participant's items. */
export function newId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

/** Toolbar items that could show the notes layer; the first one does, so a window has one. */
const layerOwners = shallowRef<symbol[]>([])

export function claimNotesLayer(): { owns: Readonly<Ref<boolean>>, release(): void } {
  const token = Symbol('notes')
  layerOwners.value = [...layerOwners.value, token]
  return {
    owns: computed(() => layerOwners.value[0] === token),
    release: () => layerOwners.value = layerOwners.value.filter(t => t !== token),
  }
}
