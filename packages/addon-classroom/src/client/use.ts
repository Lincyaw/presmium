import { useService, useSessionSnapshot } from '@presmium/host'
import { CLASSROOM_STORE, errorMessage } from '@presmium/kernel'
import type { ClassroomStore, StoredItem } from '@presmium/kernel'
import type { ComputedRef, Ref } from 'vue'
import { computed, shallowRef, watchEffect } from 'vue'
import { bothStores, browserStore } from './local.ts'

export function useSession() {
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

export function useNotes() {
  const { session, status, joined } = useSession()
  const inClassroom = computed(() => joined.value && status.value === 'active' && session.value?.personal !== undefined)
  const store = computed(() => (inClassroom.value ? bothStores(session.value!.personal!, browserStore()) : browserStore()))
  return { store, inClassroom }
}

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

export function newId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}
