import { createContext, useContext, useEffect, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { MESSAGES } from './messages.ts'
import type { WorkbenchMessages } from './messages.ts'
import type { Workbench, WorkbenchState } from './store.ts'
import { PmButton, PmDialog, PmNotice } from './components.tsx'

const WORKBENCH = createContext<Workbench | undefined>(undefined)

export function WorkbenchProvider({ workbench, children, protectChanges = true }: { workbench: Workbench, children?: ReactNode, protectChanges?: boolean }) {
  return <WORKBENCH.Provider value={workbench}>{children}{protectChanges && <UnsavedChanges />}</WORKBENCH.Provider>
}

function UnsavedChanges() {
  const workbench = useWorkbenchStore()
  const files = useWorkbench(state => state.leaving)
  const saving = useWorkbench(state => state.leaveSaving)
  const failed = useWorkbench(state => state.leaveFailed)
  const t = useMessages()
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!workbench.state.open.some(file => file.dirty)) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', beforeUnload)
    const refreshFiles = () => { void workbench.checkDisk() }
    window.addEventListener('focus', refreshFiles)
    return () => {
      window.removeEventListener('beforeunload', beforeUnload)
      window.removeEventListener('focus', refreshFiles)
    }
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

export function useWorkbenchStore(): Workbench {
  const workbench = useContext(WORKBENCH)
  if (!workbench) throw new Error('a workbench panel is drawn outside WorkbenchProvider')
  return workbench
}

export function useWorkbench<T>(select: (state: WorkbenchState) => T): T {
  const workbench = useWorkbenchStore()
  return useSyncExternalStore(workbench.subscribe, () => select(workbench.getState()))
}

export function useMessages(): WorkbenchMessages {
  return MESSAGES[useWorkbench(state => state.locale)]
}
