import { useEffect, useState, useSyncExternalStore } from 'react'
import type { DesktopHost, DesktopState } from '@lincyaw/kernel'
import { PmIconButton, useWorkbenchState } from '@lincyaw/workbench'
import { DESKTOP_MESSAGES } from './desktop-messages.ts'

const absent = (): DesktopState | undefined => undefined
const noSubscription = () => () => {}

/** Browser sessions keep their ordinary app bar; the installed app supplies this bounded bridge. */
export function DesktopUpdate() {
  const [host, setHost] = useState<DesktopHost | undefined>(() => window.presmiumDesktop)
  const [failed, setFailed] = useState(false)
  const locale = useWorkbenchState(state => state.locale)
  useEffect(() => {
    const ready = () => setHost(window.presmiumDesktop)
    window.addEventListener('presmium-desktop-ready', ready)
    ready()
    return () => window.removeEventListener('presmium-desktop-ready', ready)
  }, [])
  const snapshot = useSyncExternalStore(host?.subscribe ?? noSubscription, host?.getSnapshot ?? absent)
  if (!host || !snapshot || !snapshot.update.version) return null
  const t = DESKTOP_MESSAGES[locale]
  const update = snapshot.update
  const phase = failed ? 'error' : update.phase
  const label = phase === 'downloading' ? t.downloading(update.progress) : t[phase]
  const title = [t.currentVersion(snapshot.version), ...(update.version ? [t.candidate(update.version)] : []), label].join(' · ')
  const busy = ['checking', 'downloading', 'installing'].includes(phase)
  const icon = phase === 'current' ? 'check' : phase === 'error' ? 'warning' : phase === 'available' || phase === 'downloading' ? 'download' : 'refresh'
  return <PmIconButton icon={icon} loading={busy} disabled={busy} label={title} hint={title}
    onClick={() => { setFailed(false); void host.activateUpdate().catch(() => setFailed(true)) }} />
}
