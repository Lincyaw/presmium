import type { PresenterPanel, PresenterPanels, Unsubscribe } from '@lincyaw/kernel'
import { currentLocale } from './locale.ts'
import { HOST_MESSAGES } from './messages.ts'
import StartReportPanel from './start-report-panel.ts'
import type { StatusProvider, StatusRegistry, Toolbar, ToolbarItem } from './contracts.ts'

interface Item {
  id: string
  order?: number
}

interface Registry<T extends Item> {
  register(item: T): Unsubscribe
  list(): T[]
  subscribe(listener: () => void): Unsubscribe
}

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

export function createPresenterPanels(): PresenterPanels {
  const service = createRegistry<PresenterPanel>('presenter panel')
  service.register({
    id: 'presmium.core.start-report',
    get title() {
      return HOST_MESSAGES[currentLocale()].startReport
    },
    component: StartReportPanel,
    order: -1,
  })
  return service
}

export function createToolbar(): Toolbar {
  return createRegistry<ToolbarItem>('toolbar item')
}

export function createStatusRegistry(onChange?: () => void): StatusRegistry {
  const providers = new Map<string, StatusProvider>()
  return {
    register(provider) {
      providers.set(provider.id, provider)
      onChange?.()
      return () => {
        if (providers.get(provider.id) !== provider) return
        providers.delete(provider.id)
        onChange?.()
      }
    },
    list: () => [...providers.values()],
  }
}
