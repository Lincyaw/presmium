import { useService, useSessionSnapshot } from '@presmium/host'
import { CLASSROOM_STORE, errorMessage } from '@presmium/kernel'
import type { ClassroomStore, StoredItem } from '@presmium/kernel'
import type { ComputedRef, Ref } from 'vue'
import { computed, shallowRef, watchEffect } from 'vue'
import { bothStores, browserStore } from './local.ts'

/** The `session` service and its live snapshot (the host's `useSessionSnapshot`); `joined` while this window is in a classroom, active or ended. */
export function useSession() {
  const { session, snapshot } = useSessionSnapshot()
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

/**
 * The items of a collection of `store` whose value has the shape `valid`
 * checks (participants write them), kept current as the store changes or is
 * replaced.
 */
export function useCollection<T>(store: () => ClassroomStore | undefined, name: string, valid: (value: unknown) => value is T): Readonly<Ref<StoredItem<T>[]>> {
  const items = shallowRef<StoredItem<T>[]>([])
  watchEffect((onCleanup) => {
    const current = store()
    const update = () => {
      items.value = (current?.list<unknown>(name) ?? []).filter((item): item is StoredItem<T> => valid(item.value))
    }
    update()
    if (current) onCleanup(current.subscribe(name, update))
  })
  return items
}

/**
 * Where this window's notes go: always to the browser, so they outlast the
 * classroom (archiving it frees the participant's own store on the server).
 * While the classroom is active
 * they also go to the participant's own store, and the window shows the notes
 * of both.
 */
export function useNotes() {
  const { session, status, joined } = useSession()
  const inClassroom = computed(() => joined.value && status.value === 'active' && session.value?.personal !== undefined)
  const store = computed(() => (inClassroom.value ? bothStores(session.value!.personal!, browserStore()) : browserStore()))
  return { store, inClassroom }
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
      failure.value = errorMessage(error)
      return false
    }
  }
  return { failure, write }
}

/** An id for a new item: unique enough within one participant's items. */
export function newId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}
