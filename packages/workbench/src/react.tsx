/**
 * The workbench store in React: one `Workbench` for the page, given by the
 * layout that places the panels (`WorkbenchProvider`), read with a selector
 * (`useWorkbench`), and the panels' text in the store's language.
 */
import { createContext, useContext, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { MESSAGES } from './messages.ts'
import type { WorkbenchMessages } from './messages.ts'
import type { Workbench, WorkbenchState } from './store.ts'

const WORKBENCH = createContext<Workbench | undefined>(undefined)

export function WorkbenchProvider({ workbench, children }: { workbench: Workbench, children?: ReactNode }) {
  return <WORKBENCH.Provider value={workbench}>{children}</WORKBENCH.Provider>
}

/** The page's workbench. */
export function useWorkbenchStore(): Workbench {
  const workbench = useContext(WORKBENCH)
  if (!workbench) throw new Error('a workbench panel is drawn outside WorkbenchProvider')
  return workbench
}

/** A part of the workbench's state, drawn again when it changes. */
export function useWorkbench<T>(select: (state: WorkbenchState) => T): T {
  const workbench = useWorkbenchStore()
  return useSyncExternalStore(workbench.subscribe, () => select(workbench.getState()))
}

/** The panels' text in the workbench's language. */
export function useMessages(): WorkbenchMessages {
  return MESSAGES[useWorkbench(state => state.locale)]
}
