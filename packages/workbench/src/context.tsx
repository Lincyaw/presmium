import { createContext, useContext, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { MESSAGES } from './messages.ts'
import type { WorkbenchMessages } from './messages.ts'
import { DOCUMENT_TREE_MESSAGES } from './tree-messages.ts'
import type { DocumentTreeMessages } from './tree-messages.ts'
import type { Workbench } from './workbench.ts'
import type { WorkbenchState } from './workbench-state.ts'
import { PmDialogActionsContext } from './components.tsx'

const WORKBENCH = createContext<Workbench | undefined>(undefined)

/** Gives the panels drawn in it one workbench. */
export function WorkbenchProvider({ workbench, children, dialogActions }: { workbench: Workbench, children?: ReactNode, dialogActions?: ReactNode }) {
  return <WORKBENCH.Provider value={workbench}>{dialogActions === undefined ? children : <PmDialogActionsContext.Provider value={dialogActions}>{children}</PmDialogActionsContext.Provider>}</WORKBENCH.Provider>
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

export function useTreeMessages(): DocumentTreeMessages {
  return DOCUMENT_TREE_MESSAGES[useWorkbenchState(state => state.locale)]
}

/** Where the open document's inherited settings come from: its parent in the document tree, else the workspace defaults. */
export function useInheritedFrom(): string {
  const t = useTreeMessages()
  const parent = useWorkbenchState(state => {
    const id = state.authoring?.content?.id
    const nodes = state.documentTree?.nodes
    return id && nodes ? nodes[nodes[id]?.parent ?? '']?.title : undefined
  })
  return parent ? t.inheritedFrom(parent) : t.inheritedWorkspace
}
