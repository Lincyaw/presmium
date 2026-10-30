// Whether the author wants the kitten: one choice for every place it shows, kept in this browser and followed by
// every open tab. It is on until the author turns it off.
import { useSyncExternalStore } from 'react'

const KEY = 'presmium.mascot'
const listeners = new Set<() => void>()

function read(): boolean {
  try { return localStorage.getItem(KEY) !== 'off' } catch { return true }
}

let enabled = typeof localStorage === 'undefined' ? true : read()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  const storage = (event: StorageEvent) => {
    if (event.key !== KEY) return
    enabled = read()
    for (const each of listeners) each()
  }
  window.addEventListener('storage', storage)
  return () => { listeners.delete(listener); window.removeEventListener('storage', storage) }
}

export function mascotEnabled(): boolean {
  return enabled
}

export function setMascotEnabled(on: boolean): void {
  enabled = on
  try { localStorage.setItem(KEY, on ? 'on' : 'off') } catch { /* The choice holds for this page only. */ }
  for (const listener of listeners) listener()
}

export function useMascotEnabled(): boolean {
  return useSyncExternalStore(subscribe, mascotEnabled, () => true)
}
