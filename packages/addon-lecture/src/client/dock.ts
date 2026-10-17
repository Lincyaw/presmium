/**
 * The lecture panel docks at the right of edit mode's split (N-10,
 * docs/architecture.md 5.11), below the AI changes, as an item of the
 * toolbar's `dock` slot (./WritebackDock.vue), registered while edit mode is
 * on and the author asked for it (./WritebackPanel.vue, the toolbar's switch),
 * so the shell gives the dock its room only then.
 */
import { EDIT_MODE, presmiumService } from '@presmium/host'
import type { Toolbar } from '@presmium/host'
import type { Unsubscribe } from '@presmium/kernel'
import { computed, ref, watch } from 'vue'
import { LECTURE_ID } from '../domain/index.ts'
import WritebackDock from './WritebackDock.vue'

/** The author asked for the lecture panel; leaving edit mode drops it. */
export const writebackWanted = ref(false)

/** Edit mode is on. */
export const editing = computed(() => presmiumService(EDIT_MODE)?.active.value ?? false)

/** Docks the panel while edit mode is on and it is wanted; the returned function stops and undocks it. */
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
