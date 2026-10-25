import { presmiumReport, presmiumService, runtimeRevision } from '@lincyaw/host'
import type { ServiceToken } from '@lincyaw/kernel'

export function whenService<T>(token: ServiceToken<T>): Promise<T | undefined> {
  const initial = presmiumService(token)
  if (initial || presmiumReport()) return Promise.resolve(initial)
  return new Promise(resolve => {
    const stop = runtimeRevision.subscribe(() => {
      const service = presmiumService(token)
      if (!service && !presmiumReport()) return
      stop(); resolve(service)
    })
  })
}
