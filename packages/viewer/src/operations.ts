/**
 * The IR runtime's operations (docs/architecture.md 4.9, docs/ir.md 9.2): it
 * reports `go` (section, step, view) whenever the position or the view
 * changes, and replays a `go` by showing its view and position. The report
 * is made at once (a synchronous watcher), so a change a replay makes is
 * reported while the host's `replaying` is set, and dropped.
 */
import type { Operations } from '@presmium/host'
import { watch } from 'vue'
import { getView } from './registry.ts'
import type { Viewer } from './viewer.ts'

export function followOperations(viewer: Viewer, operations: Operations): () => void {
  const stop = watch(
    () => ({ section: viewer.position.value.section, step: viewer.position.value.step, view: viewer.view.value }),
    (now, before) => {
      if (before && now.section === before.section && now.step === before.step && now.view === before.view) return
      operations.report({ type: 'go', data: { ...now } })
    },
    { flush: 'sync' },
  )
  const off = operations.onReplay('go', {
    apply(data) {
      const view = typeof data.view === 'string' ? getView(data.view) : undefined
      if (view && !view.hidden) viewer.setView(view.id)
      if (typeof data.section !== 'string') return
      const step = Number(data.step)
      viewer.show({ section: data.section, step: Number.isFinite(step) && step >= 0 ? step : 0 })
    },
  })
  return () => {
    stop()
    off()
  }
}
