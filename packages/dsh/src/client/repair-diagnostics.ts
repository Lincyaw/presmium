import { selectedDocument } from '@lincyaw/workbench'
import type { Workbench } from '@lincyaw/workbench'
import { mainViewAgentSession, postDocumentContext } from './document-context.ts'
import { CLIENT_MESSAGES } from './messages.ts'

/** Lets the problems panel ask the main view's agent session to repair the selected document's diagnostics. */
export function registerDiagnosticsRepair(ctx: DshClientContext, workbench: Workbench): void {
  ctx.inject(['sessions', 'layout'], inner => inner.effect(() => {
    let active: DshSessionBinding | undefined
    let offRepair: (() => void) | undefined
    const update = () => {
      const row = mainViewAgentSession(inner.sessions.list.getSnapshot().byId)
      const binding = row && inner.sessions.binding(row.id)
      if (binding === active) return
      offRepair?.()
      offRepair = undefined
      active = binding
      if (!row || !binding) return
      const id = row.id
      offRepair = workbench.onRepairDiagnostics(async (diagnostics) => {
        const t = () => CLIENT_MESSAGES[workbench.state.locale]
        const document = selectedDocument(workbench.state)
        const isCurrent = () => active === binding && inner.sessions.binding(id) === binding
          && mainViewAgentSession(inner.sessions.list.getSnapshot().byId)?.id === id
          && selectedDocument(workbench.state) === document
        if (document === null || diagnostics.some(diagnostic => diagnostic.document !== document) || !isCurrent()) throw new Error(t().repairStale)
        const response = await postDocumentContext(id, document)
        if (!response.ok) throw new Error(await response.text() || `HTTP ${response.status}`)
        if (!isCurrent()) throw new Error(t().repairStale)
        const text = `${t().repairRequest}\n${JSON.stringify(diagnostics.slice(0, 20))}`
        const submission = binding.session.beginSubmission({ mode: 'queue', text, attachments: [] })
        try {
          const result = await binding.session.prompt([{ type: 'text', text }], 'queue', undefined, submission.requestId)
          if (!result.ok) throw new Error(result.error.message)
          inner.layout.selectPanel(null)
        } catch (error) {
          submission.abandon()
          throw error
        }
      })
    }
    const off = inner.sessions.list.subscribe(update)
    update()
    return () => { off(); offRepair?.() }
  }, 'presmium: explicitly ask the current session to repair diagnostics'))
}
