import { onBeforeUnmount, onMounted, ref } from 'vue'
import { listActions } from '../registry.ts'
import type { ViewerAction } from '../registry.ts'
import type { Viewer } from '../viewer-state.ts'

/** Whether the present view shows its overview of the sections. */
export const overviewOpen = ref(false)

export const BUILTIN_ACTIONS: readonly ViewerAction[] = [
  { id: 'next', keys: ['ArrowRight', 'ArrowDown', 'PageDown', ' '], run: (viewer) => { viewer.next() } },
  { id: 'prev', keys: ['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'], run: (viewer) => { viewer.prev() } },
  { id: 'first', keys: ['Home'], run: viewer => viewer.go({ section: viewer.doc.value.sections[0]?.id ?? '', step: 0 }) },
  { id: 'last', keys: ['End'], run: viewer => viewer.go({ section: viewer.doc.value.sections.at(-1)?.id ?? '', step: Number.POSITIVE_INFINITY }) },
  { id: 'exit', keys: ['Escape'], views: ['present'], run: viewer => (viewer.options.slidesOnly ? false : viewer.setView(viewer.pageView.value)) },
  {
    id: 'presenter',
    keys: ['p'],
    views: ['present'],
    run: viewer => viewer.options.openPresenter ? viewer.options.openPresenter(viewer.position.value) : false,
  },
  { id: 'overview', keys: ['o'], views: ['present'], run: () => { overviewOpen.value = !overviewOpen.value } },
]

function typing(target: EventTarget | null): boolean {
  return Boolean((target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable], [role="dialog"], [role="menu"], [role="tablist"], [role="slider"]'))
}

/** Runs the registered actions of a view on their keys while the view is mounted. */
export function useActions(viewer: Viewer, view: string): void {
  const onKey = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || typing(event.target)) return
    for (const action of listActions(view)) {
      if (!action.keys.includes(event.key) || action.run(viewer) === false) continue
      event.preventDefault()
      return
    }
  }
  onMounted(() => {
    window.addEventListener('keydown', onKey)
    document.documentElement.classList.add('pm-presenting')
  })
  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKey)
    document.documentElement.classList.remove('pm-presenting')
  })
}
