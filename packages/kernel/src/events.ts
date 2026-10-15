import type { DomainEvent, EventBus } from './contracts.ts'

type Handler = (event: DomainEvent) => void
type ErrorHandler = (error: unknown, event: DomainEvent) => void

const reportToConsole: ErrorHandler = (error, event) => {
  console.error(`[presmium] handler for "${event.type}" threw`, error)
}

/**
 * Synchronous in-process event bus. A throwing handler is reported through
 * `onError` and does not stop the other handlers.
 */
export function createEventBus(onError: ErrorHandler = reportToConsole): EventBus {
  const handlers = new Map<string, Set<Handler>>()
  return {
    emit(event) {
      for (const handler of [...(handlers.get(event.type) ?? [])]) {
        try {
          handler(event)
        } catch (error) {
          onError(error, event)
        }
      }
    },
    on(type, handler) {
      const set = handlers.get(type) ?? new Set()
      handlers.set(type, set)
      const h = handler as Handler
      set.add(h)
      return () => {
        set.delete(h)
      }
    },
  }
}
