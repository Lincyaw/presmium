import type { Operations } from '@lincyaw/host'
import { findView } from './registry.ts'
import type { Viewer } from './viewer-state.ts'
export function syncViewerWithOperations(viewer: Viewer, operations: Operations): () => void {
  const report = () => operations.report({ type: 'go', data: { ...viewer.position.getSnapshot(), view: viewer.view.getSnapshot() } })
  const subscriptions = [viewer.position.subscribe(report), viewer.view.subscribe(report)]
  const off = operations.onReplay('go', { apply(data) { const view = typeof data.view === 'string' ? findView(data.view) : undefined; if (view && !view.hidden) viewer.setView(view.id); if (typeof data.section !== 'string') return; const step = Number(data.step); viewer.show({ section: data.section, step: Number.isFinite(step) && step >= 0 ? step : 0 }) } })
  return () => { subscriptions.forEach(stop => stop()); off() }
}
