import { createContext, useContext, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { MESSAGES } from './messages.ts'
import type { WorkbenchMessages } from './messages.ts'
import type { Workbench, WorkbenchState } from './store.ts'

const WORKBENCH = createContext<Workbench | undefined>(undefined)

export function WorkbenchProvider({ workbench, children }: { workbench: Workbench, children?: ReactNode }) {
  return <WORKBENCH.Provider value={workbench}>{children}</WORKBENCH.Provider>
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
