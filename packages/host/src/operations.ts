import type { Operation, Unsubscribe } from '@presmium/kernel/contracts'
import { ref } from 'vue'
import type { Operations, ReplayHandler, StatusProvider, StatusRegistry } from './types.ts'

export function createOperations(): Operations {
  const listeners = new Set<(operation: Operation) => void>()
  const handlers = new Map<string, ReplayHandler>()
  const replaying = ref(false)
  let unsettled = 0
  return {
    report(operation) {
      if (replaying.value) return
      for (const listener of [...listeners]) {
        try {
          listener(operation)
        } catch (error) {
          console.error('[presmium] an operations subscriber failed', error)
        }
      }
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    onReplay(type, handler): Unsubscribe {
      handlers.set(type, handler)
      return () => {
        if (handlers.get(type) === handler) handlers.delete(type)
      }
    },
    replay(operation, seeking = false) {
      const handler = handlers.get(operation.type)
      if (!handler) return false
      unsettled++
      replaying.value = true
      try {
        handler.apply(operation.data, seeking)
      } catch (error) {
        console.error(`[presmium] the replay of ${operation.type} failed`, error)
      } finally {
        setTimeout(() => {
          if (--unsettled === 0) replaying.value = false
        }, 0)
      }
      return true
    },
    clear() {
      for (const [type, handler] of handlers) {
        try {
          handler.clear?.()
        } catch (error) {
          console.error(`[presmium] clearing ${type} failed`, error)
        }
      }
    },
    replaying,
  }
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
