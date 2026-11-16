import { useEffect, useSyncExternalStore } from 'react'
import type { Workbench } from '@lincyaw/workbench'

/** A committed shell plus its usable document list ends the product startup screen; AI history is independent. */
export function useStartupReady(workbench: Workbench): void {
  const ready = useSyncExternalStore(workbench.subscribe, () => Boolean(workbench.state.documents || workbench.state.documentsFailure))
  const locale = useSyncExternalStore(workbench.subscribe, () => workbench.state.locale)
  const dark = useSyncExternalStore(workbench.subscribe, () => workbench.state.isDark)
  useEffect(() => {
    if (!ready) return
    try {
      localStorage.setItem('presmium.startup.locale', locale)
      localStorage.setItem('presmium.startup.dark', String(dark))
    } catch { /* Storage is optional. */ }
    window.dispatchEvent(new Event('presmium:workspace-ready'))
  }, [ready, locale, dark])
}
