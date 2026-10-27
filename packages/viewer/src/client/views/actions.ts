import { useEffect } from 'react'
import { createStore } from '@lincyaw/host'
import { listActions } from '../registry.ts'
import type { ViewerAction } from '../registry.ts'
import type { Viewer } from '../viewer-state.ts'

/** Whether the present view shows its overview of the sections. */
export const overviewOpen = createStore(false)

export const BUILTIN_ACTIONS: readonly ViewerAction[] = [
  { id: 'next', keys: ['ArrowRight', 'ArrowDown', 'PageDown', ' '], run: (viewer) => { viewer.next() } },
  { id: 'prev', keys: ['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'], run: (viewer) => { viewer.prev() } },
  { id: 'first', keys: ['Home'], run: viewer => viewer.go({ section: viewer.doc.getSnapshot().sections[0]?.id ?? '', step: 0 }) },
  { id: 'last', keys: ['End'], run: viewer => viewer.go({ section: viewer.doc.getSnapshot().sections.at(-1)?.id ?? '', step: Number.POSITIVE_INFINITY }) },
  { id: 'exit', keys: ['Escape'], views: ['present'], run: viewer => (viewer.options.slidesOnly ? false : viewer.options.exitPresentation ? viewer.options.exitPresentation() : viewer.setView(viewer.pageView.getSnapshot())) },
  {
    id: 'presenter',
    keys: ['p'],
    views: ['present'],
    run: viewer => viewer.options.openPresenter ? viewer.options.openPresenter(viewer.position.getSnapshot()) : false,
  },
  { id: 'overview', keys: ['o'], views: ['present'], run: () => { overviewOpen.set(!overviewOpen.getSnapshot()) } },
]

function typing(target: EventTarget | null): boolean {
  return Boolean((target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable], [role="dialog"], [role="menu"], [role="tablist"], [role="slider"]'))
}

/** Runs the registered actions of a view on their keys while the view is mounted. */
export function useActions(viewer: Viewer, view: string, extra: readonly ViewerAction[] = []): void {
  const onKey = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.isComposing || event.altKey || event.ctrlKey || event.metaKey || typing(event.target)) return
    if (event.key === ' ' && (event.target as Element | null)?.closest?.('button, a[href]')) return
    for (const action of [...extra, ...listActions(view)]) {
      if (!action.keys.includes(event.key) || action.run(viewer) === false) continue
      event.preventDefault()
      return
    }
  }
  useEffect(() => {
    window.addEventListener('keydown', onKey)
    document.documentElement.classList.add('pm-presenting')
    return () => { window.removeEventListener('keydown', onKey); document.documentElement.classList.remove('pm-presenting') }
  }, [viewer, view, extra])
}
