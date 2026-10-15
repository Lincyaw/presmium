import type { PresenterPanel, PresenterPanels } from '@presmium/kernel'

/** The `presenterPanels` service: panels ordered by `order`, then by registration. */
export function createPresenterPanels(): PresenterPanels {
  const panels = new Map<string, PresenterPanel>()
  const listeners = new Set<() => void>()
  const notify = () => listeners.forEach(listener => listener())
  return {
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
}
