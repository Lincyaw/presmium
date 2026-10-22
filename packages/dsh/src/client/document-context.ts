import { selectedDocument } from '@lincyaw/workbench'
import type { Workbench } from '@lincyaw/workbench'

/** The agent session the main view shows. */
export function mainViewAgentSession<T extends { retainedBy: { mainView?: number } }>(byId: Record<string, T>): T | undefined {
  return Object.values(byId).find(session => (session.retainedBy.mainView ?? 0) > 0)
}

/** Tells the bundle which document the agent session works on (`null`: none, the workspace root). */
export function postDocumentContext(agentSessionId: string, document: string | null, signal?: AbortSignal): Promise<Response> {
  return fetch('/api/presmium/context', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session: agentSessionId, document }), ...signal ? { signal } : {},
  })
}

/** Keeps the main view's agent session on the document selected in the workbench, in every layout. */
export function syncDocumentContext(ctx: DshClientContext, workbench: Workbench): void {
  ctx.inject(['sessions'], inner => inner.effect(() => {
    let previous: string | undefined
    let pending: AbortController | undefined
    const sync = () => {
      const session = mainViewAgentSession(inner.sessions.list.getSnapshot().byId)
      if (!session) return
      const document = selectedDocument(workbench.state)
      const key = JSON.stringify([session.id, document])
      if (key === previous) return
      previous = key
      pending?.abort()
      pending = new AbortController()
      void postDocumentContext(session.id, document, pending.signal).catch(() => {})
    }
    const offSession = inner.sessions.list.subscribe(sync)
    const offDocument = workbench.subscribe(sync)
    sync()
    return () => { offSession(); offDocument(); pending?.abort() }
  }, 'presmium: selected document context (all layouts)'))
}
