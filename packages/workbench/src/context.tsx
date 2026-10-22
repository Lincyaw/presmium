import { createContext, useContext, useEffect, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { MESSAGES } from './messages.ts'
import type { WorkbenchMessages } from './messages.ts'
import type { Workbench, WorkbenchState } from './workbench.ts'
import { PmButton, PmDialog, PmNotice } from './components.tsx'

const WORKBENCH = createContext<Workbench | undefined>(undefined)

/**
 * Gives the panels drawn in it one workbench. The primary provider (one for each workbench) also guards unsaved
 * changes and re-reads the open files from disk when the window regains focus; auxiliary providers of the same
 * workbench pass `isPrimary={false}`.
 */
export function WorkbenchProvider({ workbench, children, isPrimary = true }: { workbench: Workbench, children?: ReactNode, isPrimary?: boolean }) {
  useDiskSyncOnFocus(isPrimary ? workbench : undefined)
  return <WORKBENCH.Provider value={workbench}>{children}{isPrimary && <UnsavedChangesGuard />}</WORKBENCH.Provider>
}

function useDiskSyncOnFocus(workbench: Workbench | undefined): void {
  useEffect(() => {
    if (!workbench) return
    const sync = () => { void workbench.checkDisk() }
    window.addEventListener('focus', sync)
    return () => window.removeEventListener('focus', sync)
  }, [workbench])
}

/** Asks to save, discard or stay before unsaved files are left, and has the browser ask before the page unloads with them. */
function UnsavedChangesGuard() {
  const workbench = useWorkbench()
  const files = useWorkbenchState(state => state.unsavedOnLeave)
  const saving = useWorkbenchState(state => state.isSavingOnLeave)
  const failed = useWorkbenchState(state => state.hasSaveOnLeaveFailed)
  const t = useMessages()
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!workbench.state.openFiles.some(file => file.isDirty)) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [workbench])
  return <PmDialog open={Boolean(files)} label={t.saveChanges} closeLabel={t.close} onClose={() => void workbench.resolveLeave('cancel')}>
    <p>{t.unsavedFiles}</p>
    <ul>{files?.map(path => <li key={path}>{path}</li>)}</ul>
    {failed && <PmNotice tone="danger">{t.saveBeforeLeavingFailed}</PmNotice>}
    <div className="pmw-notice__actions">
      <PmButton disabled={saving} onClick={() => void workbench.resolveLeave('cancel')}>{t.cancel}</PmButton>
      <PmButton disabled={saving} onClick={() => void workbench.resolveLeave('discard')}>{t.discardChanges}</PmButton>
      <PmButton disabled={saving} variant="primary" onClick={() => void workbench.resolveLeave('save')}>{t.save}</PmButton>
    </div>
  </PmDialog>
}

export function useWorkbench(): Workbench {
  const workbench = useContext(WORKBENCH)
  if (!workbench) throw new Error('a workbench panel is drawn outside WorkbenchProvider')
  return workbench
}

export function useWorkbenchState<T>(select: (state: WorkbenchState) => T): T {
  const workbench = useWorkbench()
  return useSyncExternalStore(workbench.subscribe, () => select(workbench.getState()))
}

export function useMessages(): WorkbenchMessages {
  return MESSAGES[useWorkbenchState(state => state.locale)]
}
