import { useEffect } from 'react'
import { createStore } from '@lincyaw/host'
import { keyBelongsToTarget, watchFocusSource } from '@lincyaw/kernel'
import { listActions } from '../registry.ts'
import type { ViewerAction } from '../registry.ts'
import type { Viewer } from '../viewer-state.ts'
import { presentationConfirmed } from '../viewer-state.ts'

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

const builtin = new Set(BUILTIN_ACTIONS.map(action => action.id))

/**
 * Runs the registered actions of a view on their keys while the view is mounted. A plugin's action comes before the
 * built-in one on the same key and hands the key on by returning false: the lecture player takes Space to play or
 * pause, and without a player Space moves to the next step.
 */
export function useActions(viewer: Viewer, view: string, extra: readonly ViewerAction[] = []): void {
  const onKey = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || keyBelongsToTarget(event)) return
    const actions = listActions(view)
    for (const action of [...extra, ...actions.filter(action => !builtin.has(action.id)), ...actions.filter(action => builtin.has(action.id))]) {
      if (!action.keys.includes(event.key)) continue
      if (!presentationConfirmed(viewer) && action.id !== 'exit') return
      if (action.run(viewer) === false) continue
      event.preventDefault()
      return
    }
  }
  useEffect(() => {
    watchFocusSource(document)
    window.addEventListener('keydown', onKey)
    document.documentElement.classList.add('pm-presenting')
    return () => { window.removeEventListener('keydown', onKey); document.documentElement.classList.remove('pm-presenting') }
  }, [viewer, view, extra])
}
