import { OFFLINE_REQUESTS } from '@lincyaw/kernel'

export interface OfflineRuntimes {
  bytes: number
  saved: boolean
}

async function ask<T>(type: string, timeoutMs: number): Promise<T | undefined> {
  let workers: ServiceWorkerContainer | undefined
  // A sandboxed page (a share served on the cloud's own origin) has no service workers: even the getter throws.
  try { workers = typeof navigator === 'undefined' ? undefined : navigator.serviceWorker } catch { return undefined }
  if (!workers) return undefined
  const worker = workers.controller ?? (await workers.getRegistration())?.active
  if (!worker) return undefined
  return new Promise((resolve) => {
    const channel = new MessageChannel()
    const timer = setTimeout(() => resolve(undefined), timeoutMs)
    channel.port1.onmessage = ({ data }: MessageEvent<T>) => {
      clearTimeout(timer)
      resolve(data)
    }
    worker.postMessage({ type }, [channel.port2])
  })
}

export function offlineRuntimes(): Promise<OfflineRuntimes | undefined> {
  return ask<OfflineRuntimes>(OFFLINE_REQUESTS.runtimes, 3000)
}

export async function saveOffline(): Promise<boolean> {
  return Boolean((await ask<{ ok: boolean }>(OFFLINE_REQUESTS.save, 600_000))?.ok)
}
