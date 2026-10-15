import { presmiumReport, presmiumService } from '@presmium/host'
import type { ServiceToken } from '@presmium/kernel'
import { watch } from 'vue'

/**
 * Resolves with the service once the kernel has started; undefined when it
 * started without the service. For callers outside components (code runners).
 */
export function whenService<T>(token: ServiceToken<T>): Promise<T | undefined> {
  return new Promise((resolve) => {
    const stop = watch(
      () => [presmiumService(token), presmiumReport()] as const,
      ([service, report]) => {
        if (!service && !report) return
        resolve(service)
        queueMicrotask(() => stop())
      },
      { immediate: true },
    )
  })
}
