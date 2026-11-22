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

/**
 * Where the open document's inherited setting `key` (a `SettingOrigins` key, such as `production.captions`) comes
 * from: the ancestor that sets it, else the workspace defaults; undefined when nothing above the document sets it. A
 * host that does not say where settings come from names the parent.
 */
export function useInheritedFrom(key: string): string | undefined {
  const t = useTreeMessages()
  const origin = useWorkbenchState(state => {
    const nodes = state.documentTree?.nodes
    const titleOf = (id: string) => nodes?.[id]?.title ?? state.documents?.documents.find(doc => doc.id === id)?.title
    const from = state.authoring?.inheritedFrom
    if (from) {
      if (!Object.hasOwn(from, key)) return undefined
      const id = from[key] as string | null
      if (id === null) return null
      const title = titleOf(id)
      if (title !== undefined) return title
    }
    const id = state.authoring?.content?.id
    return id && nodes ? nodes[nodes[id]?.parent ?? '']?.title ?? null : null
  })
  return origin === undefined ? undefined : origin === null ? t.inheritedWorkspace : t.inheritedFrom(origin)
}
