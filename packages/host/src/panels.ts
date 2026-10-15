import type { PresenterPanel, PresenterPanels, Unsubscribe } from '@presmium/kernel'
import { currentLocale } from './locale.ts'
import { HOST_MESSAGES } from './messages.ts'
import StartReportPanel from './StartReportPanel.vue'
import type { Toolbar, ToolbarItem } from './types.ts'

interface Item {
  id: string
  order?: number
}

interface Registry<T extends Item> {
  register(item: T): Unsubscribe
  list(): T[]
  subscribe(listener: () => void): Unsubscribe
}

/** Items ordered by `order`, then by registration; ids are unique. */
function createRegistry<T extends Item>(kind: string): Registry<T> {
  const items = new Map<string, T>()
  const listeners = new Set<() => void>()
  const notify = () => listeners.forEach(listener => listener())
  return {
    register(item) {
      if (items.has(item.id)) throw new Error(`${kind} ${item.id} is already registered`)
      items.set(item.id, item)
      notify()
      return () => {
        if (items.get(item.id) !== item) return
        items.delete(item.id)
        notify()
      }
    },
    list() {
      return [...items.values()].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

/**
 * The `presenterPanels` service of a host: panels ordered by `order`, then by
 * registration, the kernel start report first. Each host provides it and shows
 * the panels (`PmPresenterPanels`) in its presenter view only.
 */
export function createPresenterPanels(): PresenterPanels {
  const service = createRegistry<PresenterPanel>('presenter panel')
  service.register({ id: 'presmium.core.start-report', title: HOST_MESSAGES[currentLocale()].startReport, component: StartReportPanel, order: -1 })
  return service
}

/** The `toolbar` service of a host, shown by `PmToolbar` in its toolbar. */
export function createToolbar(): Toolbar {
  return createRegistry<ToolbarItem>('toolbar item')
}
