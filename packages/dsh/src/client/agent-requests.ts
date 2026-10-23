import { selectedDocument } from '@lincyaw/workbench'
import type { Workbench } from '@lincyaw/workbench'
import { mainViewAgentSession, postDocumentContext } from './document-context.ts'
import { CLIENT_MESSAGES } from './messages.ts'

/**
 * Lets the workbench hand requests to the main view's agent session: the author's "Rewrite with AI" and comments, and
 * the repair of the selected document's diagnostics. Each is prompted on the session after its document context is
 * set, and the conversation is shown.
 */
export function registerAgentRequests(ctx: DshClientContext, workbench: Workbench): void {
  ctx.inject(['sessions', 'layout'], inner => inner.effect(() => {
    let active: DshSessionBinding | undefined
    let offRequests: (() => void) | undefined
    const update = () => {
      const row = mainViewAgentSession(inner.sessions.list.getSnapshot().byId)
      const binding = row && inner.sessions.binding(row.id)
      if (binding === active) return
      offRequests?.()
      offRequests = undefined
      active = binding
      if (!row || !binding) return
      const id = row.id
      const t = () => CLIENT_MESSAGES[workbench.state.locale]
      const prompt = async (document: string | null, text: string) => {
        const isCurrent = () => active === binding && inner.sessions.binding(id) === binding
          && mainViewAgentSession(inner.sessions.list.getSnapshot().byId)?.id === id
          && selectedDocument(workbench.state) === document
        if (document === null || !isCurrent()) throw new Error(t().repairStale)
        const response = await postDocumentContext(id, document)
        if (!response.ok) throw new Error(await response.text() || `HTTP ${response.status}`)
        if (!isCurrent()) throw new Error(t().repairStale)
        const submission = binding.session.beginSubmission({ mode: 'queue', text, attachments: [] })
        try {
          const result = await binding.session.prompt([{ type: 'text', text }], 'queue', undefined, submission.requestId)
          if (!result.ok) throw new Error(result.error.message)
          inner.layout.selectPanel(null)
        } catch (error) {
          submission.abandon()
          throw error
        }
      }
      const offRepair = workbench.onRepairDiagnostics(async (diagnostics) => {
        const document = selectedDocument(workbench.state)
        if (diagnostics.some(diagnostic => diagnostic.document !== document)) throw new Error(t().repairStale)
        await prompt(document, `${t().repairRequest}\n${JSON.stringify(diagnostics.slice(0, 20))}`)
      })
      const offAsk = workbench.onAgentRequest(request => prompt(selectedDocument(workbench.state), request.text))
      offRequests = () => { offRepair(); offAsk() }
    }
    const off = inner.sessions.list.subscribe(update)
    update()
    return () => { off(); offRequests?.() }
  }, 'presmium: hand the author\'s requests to the current session'))
}
