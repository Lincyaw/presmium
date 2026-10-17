/**
 * "Save for offline use" (D-6, N-03): the web form's service worker caches
 * the heavy runtimes (Pyodide, the WASI compilers, jax-js) the first time a
 * page uses them, not when it installs; this asks it for them all at once,
 * so that code runs offline before it has run once. The service worker
 * answers on the message's port (`OFFLINE_MESSAGES`): what it would fetch,
 * and whether it has; a worker that does not answer (the slides form's,
 * which precaches everything) offers nothing.
 */
import { OFFLINE_MESSAGES } from '../domain/index.ts'

/** What the service worker says of the runtimes: their size, and whether they are saved. */
export interface OfflineRuntimes {
  bytes: number
  saved: boolean
}

/** Asks the active service worker; undefined when there is none or it does not answer within `timeoutMs`. */
async function ask<T>(type: string, timeoutMs: number): Promise<T | undefined> {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker) return undefined
  const worker = navigator.serviceWorker.controller ?? (await navigator.serviceWorker.getRegistration())?.active
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

/** The runtimes the service worker would save, when it offers to. */
export function offlineRuntimes(): Promise<OfflineRuntimes | undefined> {
  return ask<OfflineRuntimes>(OFFLINE_MESSAGES.runtimes, 3000)
}

/** Has the service worker fetch and keep the runtimes; true once they are saved. */
export async function saveOffline(): Promise<boolean> {
  return Boolean((await ask<{ ok: boolean }>(OFFLINE_MESSAGES.save, 600_000))?.ok)
}
