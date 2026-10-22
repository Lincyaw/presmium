import { useService, useSessionSnapshot } from '@lincyaw/host'
import { CLASSROOM_STORE, errorMessage } from '@lincyaw/kernel'
import type { ClassroomStore, StoredItem } from '@lincyaw/kernel'
import type { ComputedRef, Ref } from 'vue'
import { computed, shallowRef, watchEffect } from 'vue'
import { browserStore, layeredStore } from './browser-store.ts'

/** This window's part in the classroom: who it is, the session's status, whether it joined and presents. */
export function useParticipation() {
  const { session, snapshot } = useSessionSnapshot()
  const me = computed(() => snapshot.value?.me)
  const status = computed(() => snapshot.value?.status ?? 'idle')
  const joined = computed(() => status.value !== 'idle' && me.value !== undefined)
  const presenter = computed(() => joined.value && me.value?.role === 'presenter')
  return { session, snapshot, me, status, joined, presenter }
}

export function useClassroomStore(): ComputedRef<ClassroomStore | undefined> {
  return useService(CLASSROOM_STORE)
}

/** The items of a collection that `parse` reads as records, kept up to date. */
export function useCollection<T>(store: () => ClassroomStore | undefined, name: string, parse: (value: unknown) => T | undefined): Readonly<Ref<StoredItem<T>[]>> {
  const items = shallowRef<StoredItem<T>[]>([])
  watchEffect((onCleanup) => {
    const current = store()
    const update = () => {
      items.value = (current?.list<unknown>(name) ?? []).flatMap(({ id, value }) => {
        const record = parse(value)
        return record === undefined ? [] : [{ id, value: record }]
      })
    }
    update()
    if (current) onCleanup(current.subscribe(name, update))
  })
  return items
}

/** Where this window keeps its notes: the browser, and the participant's own room while in a classroom. */
export function useNoteStore() {
  const { session, status, joined } = useParticipation()
  const inClassroom = computed(() => joined.value && status.value === 'active' && session.value?.personal !== undefined)
  const store = computed(() => (inClassroom.value ? layeredStore(session.value!.personal!, browserStore()) : browserStore()))
  return { store, inClassroom }
}

/** Runs a write to the classroom store and keeps the error it throws to show. */
export function useGuardedWrite() {
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
