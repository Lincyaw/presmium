import { useService, useSessionSnapshot } from '@lincyaw/host'
import { CLASSROOM_STORE, errorMessage } from '@lincyaw/kernel'
import type { ClassroomStore, StoredItem } from '@lincyaw/kernel'
import { useEffect, useMemo, useState } from 'react'
import { browserStore, layeredStore } from './browser-store.ts'

export function useParticipation() {
  const { session, snapshot } = useSessionSnapshot()
  const me = snapshot?.me
  const status = snapshot?.status ?? 'idle'
  const joined = status !== 'idle' && me !== undefined
  return { session, snapshot, me, status, joined, presenter: joined && me?.role === 'presenter' }
}
export function useClassroomStore(): ClassroomStore | undefined { return useService(CLASSROOM_STORE) }

/** Subscription snapshots are cached in state; a collection may return a fresh array on every list(). */
export function useCollection<T>(store: () => ClassroomStore | undefined, name: string, parse: (value: unknown) => T | undefined): StoredItem<T>[] {
  const current = store()
  const [items, setItems] = useState<StoredItem<T>[]>([])
  useEffect(() => {
    const update = () => setItems((current?.list<unknown>(name) ?? []).flatMap(({ id, value }) => {
      const record = parse(value)
      return record === undefined ? [] : [{ id, value: record }]
    }))
    update()
    return current?.subscribe(name, update)
  }, [current, name, parse])
  return items
}
export function useNoteStore() {
  const { session, status, joined } = useParticipation()
  const inClassroom = joined && status === 'active' && session?.personal !== undefined
  const store = useMemo(() => inClassroom ? layeredStore(session!.personal!, browserStore()) : browserStore(), [inClassroom, session])
  return { store, inClassroom }
}
export function useGuardedWrite() {
  const [failure, setFailure] = useState('')
  function write(action: () => void): boolean {
    setFailure('')
    try { action(); return true } catch (error) { setFailure(errorMessage(error)); return false }
  }
  return { failure, write }
}
