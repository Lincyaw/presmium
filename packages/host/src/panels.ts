import type { PresenterPanel, PresenterPanels } from '@presmium/kernel'
import StartReportPanel from './StartReportPanel.vue'

/**
 * The `presenterPanels` service of a host: panels ordered by `order`, then by
 * registration, the kernel start report first. Each host provides it and shows
 * the panels (`PmPresenterPanels`) in its presenter view only.
 */
export function createPresenterPanels(): PresenterPanels {
  const panels = new Map<string, PresenterPanel>()
  const listeners = new Set<() => void>()
  const notify = () => listeners.forEach(listener => listener())
  const service: PresenterPanels = {
    register(panel) {
      if (panels.has(panel.id)) throw new Error(`presenter panel ${panel.id} is already registered`)
      panels.set(panel.id, panel)
      notify()
      return () => {
        if (panels.get(panel.id) !== panel) return
        panels.delete(panel.id)
        notify()
      }
    },
    list() {
      return [...panels.values()].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
  service.register({ id: 'presmium.core.start-report', title: '启动报告', component: StartReportPanel, order: -1 })
  return service
}
