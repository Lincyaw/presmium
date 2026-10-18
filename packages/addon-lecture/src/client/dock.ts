import { EDIT_MODE, presmiumService } from '@presmium/host'
import type { Toolbar } from '@presmium/host'
import type { Unsubscribe } from '@presmium/kernel'
import { computed, ref, watch } from 'vue'
import { LECTURE_ID } from '../domain/index.ts'
import WritebackDock from './WritebackDock.vue'

export const writebackWanted = ref(false)

export const editing = computed(() => presmiumService(EDIT_MODE)?.active.value ?? false)

export function dockWriteback(toolbar: Toolbar, title: string): Unsubscribe {
  let undock: Unsubscribe | undefined
  const stopEditing = watch(editing, (on) => {
    if (!on) writebackWanted.value = false
  })
  const stopDock = watch(() => editing.value && writebackWanted.value, (on) => {
    if (on && !undock) undock = toolbar.register({ id: `${LECTURE_ID}.writeback.dock`, title, component: WritebackDock, slot: 'dock', order: 17 })
    if (!on && undock) {
      undock()
      undock = undefined
    }
  }, { immediate: true })
  return () => {
    stopEditing()
    stopDock()
    undock?.()
    writebackWanted.value = false
  }
}
