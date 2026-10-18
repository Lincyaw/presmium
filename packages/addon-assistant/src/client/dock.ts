import { EDIT_MODE, presmiumService } from '@presmium/host'
import type { Toolbar } from '@presmium/host'
import type { Unsubscribe } from '@presmium/kernel'
import { computed, ref, watch } from 'vue'
import { ASSISTANT_ID } from '../domain/index.ts'
import EditDock from './EditDock.vue'
import { agent, assistant } from './state.ts'

export const panelWanted = ref(false)

export const editing = computed(() => presmiumService(EDIT_MODE)?.active.value ?? false)

export const inDocument = computed(() => assistant.value?.info.value?.changes === true && !assistant.value.info.value.home)

export const canChange = computed(() => (agent.value?.available('annotations') ?? false) && (agent.value?.available('chat') ?? false))

export const changing = computed(() => inDocument.value && editing.value && canChange.value)

export const docked = computed(() => changing.value && panelWanted.value)

export function dockPanel(toolbar: Toolbar, title: string): Unsubscribe {
  let undock: Unsubscribe | undefined
  const stopEditing = watch(editing, (on) => {
    panelWanted.value = on
  })
  const stopDock = watch(docked, (on) => {
    if (on && !undock) undock = toolbar.register({ id: `${ASSISTANT_ID}.dock`, title, component: EditDock, slot: 'dock', order: 16 })
    if (!on && undock) {
      undock()
      undock = undefined
    }
  }, { immediate: true })
  return () => {
    stopEditing()
    stopDock()
    undock?.()
    panelWanted.value = false
  }
}
