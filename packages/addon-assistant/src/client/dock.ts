/**
 * Where the AI changes are in edit mode (N-10, docs/architecture.md 5.11): the
 * panel docks at the right of edit mode's split, as an item of the toolbar's
 * `dock` slot (./EditDock.vue), registered while it is shown, so the shell
 * gives the dock its room only then. It is shown while edit mode is on in a
 * document whose changes the agent may make, and the author has not hidden
 * it; edit mode turned on shows it. One state for the window: the toolbar's
 * button may be drawn twice (the bar and a phone's menu).
 */
import { EDIT_MODE, presmiumService } from '@presmium/host'
import type { Toolbar } from '@presmium/host'
import type { Unsubscribe } from '@presmium/kernel'
import { computed, ref, watch } from 'vue'
import { ASSISTANT_ID } from '../domain/index.ts'
import EditDock from './EditDock.vue'
import { agent, assistant } from './state.ts'

/** The author wants the panel (the toolbar's button); edit mode turned on sets it. */
export const panelWanted = ref(false)

/** Edit mode is on. */
export const editing = computed(() => presmiumService(EDIT_MODE)?.active.value ?? false)

/** The page is a document whose changes the workspace commits (not the home page, nor one in no git repository). */
export const inDocument = computed(() => assistant.value?.info.value?.changes === true && !assistant.value.info.value.home)

/** The agent may make changes here: annotations and chat. */
export const canChange = computed(() => (agent.value?.available('annotations') ?? false) && (agent.value?.available('chat') ?? false))

/** The change panel: edit mode is on in a document the agent may change. */
export const changing = computed(() => inDocument.value && editing.value && canChange.value)

/** The panel is docked now. */
export const docked = computed(() => changing.value && panelWanted.value)

/** Docks the panel while `docked`; the returned function stops and undocks it. */
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
