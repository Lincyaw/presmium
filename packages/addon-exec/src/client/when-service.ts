import { presmiumReport, presmiumService } from '@lincyaw/host'
import type { ServiceToken } from '@lincyaw/kernel'
import { watch } from 'vue'

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
