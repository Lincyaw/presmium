import { invoke } from '@tauri-apps/api/core'
import type { DesktopHost, DesktopState } from '@lincyaw/kernel'

// The native command also verifies the exact running Studio origin and the main window.
// Never expose a bridge to child frames, previews, or external pages.
if (window === window.top) void connect()

async function connect(): Promise<void> {
  let snapshot: DesktopState
  try { snapshot = await invoke<DesktopState>('desktop_state') } catch { return }
  const listeners = new Set<() => void>()
  const attributes = () => {
    document.documentElement.dataset.pmDesktop = snapshot.platform
    document.documentElement.toggleAttribute('data-pm-desktop-fullscreen', snapshot.fullscreen)
  }
  const host: DesktopHost = {
    getSnapshot: () => snapshot,
    subscribe(changed) { listeners.add(changed); return () => { listeners.delete(changed) } },
    activateUpdate: () => invoke('activate_app_update'),
  }
  window.presmiumDesktop = host
  window.addEventListener('presmium-desktop-state', event => {
    snapshot = (event as CustomEvent<DesktopState>).detail
    attributes()
    for (const changed of listeners) changed()
  })
  const ready = () => { attributes(); window.dispatchEvent(new Event('presmium-desktop-ready')) }
  if (document.documentElement) ready()
  else document.addEventListener('DOMContentLoaded', ready, { once: true })
  const background = (event: MouseEvent) => event.target instanceof Element
    && event.target.closest('[data-pm-window-drag]')
    && !event.target.closest('button, a, input, textarea, select, [role="button"], [contenteditable="true"]')
  document.addEventListener('mousedown', event => {
    if (event.button === 0 && event.detail === 1 && background(event)) void invoke('drag_window').catch(() => {})
  })
  document.addEventListener('dblclick', event => {
    if (event.button === 0 && background(event)) void invoke('toggle_window').catch(() => {})
  })
}
