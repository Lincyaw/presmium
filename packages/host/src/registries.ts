import type { PresenterPanel, PresenterPanels, Unsubscribe } from '@lincyaw/kernel'
import { currentLocale } from './locale.ts'
import { HOST_MESSAGES } from './messages.ts'
import StartReportPanel from './start-report-panel.ts'
import type { PageReadiness, StatusProvider, StatusRegistry, TimedCaptions, Toolbar, ToolbarItem } from './contracts.ts'
import { createStore } from './store.ts'

export function createTimedCaptions(): TimedCaptions {
  const owners = new Set<symbol>(), active = createStore(false)
  return { active, claim() {
    const owner = Symbol()
    owners.add(owner); active.set(true)
    return () => { if (owners.delete(owner)) active.set(owners.size > 0) }
  } }
}

export function createPageReadiness(): PageReadiness {
  const holders = new Set<symbol>(), pending = createStore(0)
  return { pending, hold() {
    const holder = Symbol()
    holders.add(holder); pending.set(holders.size)
    return () => { if (holders.delete(holder)) pending.set(holders.size) }
  } }
}

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
