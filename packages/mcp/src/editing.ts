import { randomUUID } from 'node:crypto'
import { AUTHORING_CLIENT_MAX_CLIENTS, DOCUMENT_PAGE_DUPLICATION_SCHEMA, deckLocale, errorMessage } from '@lincyaw/kernel'
import { DOCUMENT_CHANGE_JSON_SCHEMA } from '@lincyaw/kernel/node'
import type { AuthoringClientDescriptor, CanonicalSource, DocumentAnswer, DocumentChange, DocumentEditOperation } from '@lincyaw/kernel'
import type { Call, ToolSpec } from './mcp.ts'
import { documentChangeSummary, MCP_MESSAGES } from './messages.ts'

const fields = DOCUMENT_PAGE_DUPLICATION_SCHEMA.properties
const common = { document: { type: 'string', maxLength: 200 }, source: fields.source, requestId: fields.id }
const sameSource = (a: CanonicalSource | undefined, b: CanonicalSource) => a?.documentId === b.documentId && a.version === b.version && a.fingerprint === b.fingerprint
const sourceOf = (value: DocumentAnswer): CanonicalSource => ({ documentId: value.content.id, version: value.version, fingerprint: value.fingerprint })

async function open(call: Call) {
  if (JSON.stringify(call.args).length > 32768) throw Object.assign(new Error('document-edit-request-too-large'), { status: 413 })
  const own = call.host.authoring
  if (!own) throw Object.assign(new Error('authoring-host-unavailable'), { status: 503 })
  const capability = own.capabilities(await call.document(), call.caller.member)
  if (!capability.actions.apply) throw Object.assign(new Error(capability.applyUnavailableReason === 'review-required' ? 'authoring-review-required' : 'authoring-permission-denied'), { status: capability.applyUnavailableReason ? 409 : 403 })
  const document = await call.document(), current = await own.read(document, call.caller.member), source = sourceOf(current)
  if (call.args.source && !sameSource(call.args.source as CanonicalSource, source)) throw Object.assign(new Error('document-version-changed'), { status: 409, detail: { currentSource: source } })
  return { own, document, current, source }
}

/** Observed editor state is distinct from a saved source and from a prepared preview. */
async function editorFeedback(call: Call, document: string, source: CanonicalSource) {
  if (!call.host.authoringClients) return { status: 'unavailable' }
  const deadline = Date.now() + 750
  try {
    for (;;) {
      const connected: AuthoringClientDescriptor[] = []
      let after: string | undefined
      let scanned = 0
      for (let page = 0; page < AUTHORING_CLIENT_MAX_CLIENTS; page++) {
        const report = await call.host.authoringClients.list(document, after ? { after } : {}, call.caller.member)
        connected.push(...report.clients.filter(client => client.connected))
        scanned += report.clients.length
        after = report.nextAfter
        if (!after || connected.length >= 8 || scanned >= AUTHORING_CLIENT_MAX_CLIENTS || Date.now() >= deadline || call.signal.aborted) break
      }
      const clients = connected.slice(0, 8).map(client => ({
        clientId: client.clientId, view: client.snapshot.view, observedAt: client.observedAt,
        current: sameSource(client.snapshot.source, source) && !client.snapshot.editing.dirty && !client.snapshot.editing.loading && !client.snapshot.editing.conflicted && !client.snapshot.editing.saving && !client.snapshot.editing.composing,
        preview: client.snapshot.preview?.status === 'prepared' ? sameSource(client.snapshot.preview.source, source) ? 'current' : 'stale' : client.snapshot.preview?.status ?? 'unobserved',
      }))
      const current = clients.some(client => client.current)
      const result = { status: current ? 'current' : clients.length || after ? 'pending' : 'unavailable', evidence: 'reported-state', clients, hasMore: Boolean(after) || connected.length > 8 }
      if (current || !clients.length || Date.now() >= deadline || call.signal.aborted) return result
      await new Promise(resolve => setTimeout(resolve, 50))
    }
  } catch (error) {
    // The save already succeeded; report a feedback failure without disguising it as a failed write.
    console.error(`presmium mcp: editor feedback failed: ${errorMessage(error)}`)
    return { status: 'unavailable', error: { code: 'editor-feedback-unavailable' } }
  }
}

async function edit(call: Call, opened: Awaited<ReturnType<typeof open>>, operations: DocumentEditOperation[], sectionId?: string) {
  const { own, document, current, source } = opened
  const change: DocumentChange = { id: String(call.args.requestId ?? randomUUID()), baseDocumentVersion: source.version, operations }
  const plan = await own.plan(document, change, call.caller.member)
  const summary = documentChangeSummary(MCP_MESSAGES[deckLocale(current.content.metadata.lang)], change, current.content)
  await call.approve('operate', messages => messages.applyDocumentChange, { lang: current.content.metadata.lang, detail: summary, check: () => own.checkApply(document, { change, planId: plan.planId }, call.caller.member) })
  call.signal.throwIfAborted()
  const applied = await own.apply(document, { change, planId: plan.planId }, call.caller.member)
  const saved = sourceOf(applied)
  return {
    document, changeId: applied.changeId, changed: saved.version !== source.version, source: saved, summary: summary.slice(0, 1200), summaryComplete: summary.length <= 1200,
    ...sectionId ? { page: { sectionId, number: applied.content.sectionOrder.indexOf(sectionId) + 1, title: applied.content.sections[sectionId]!.title } } : {},
    ...applied.commit ? { commit: { id: applied.commit.id } } : {},
    verification: { saved: true, sourceReadback: true, compiled: 'not-requested', editor: await editorFeedback(call, document, saved) },
    validation: { errors: applied.issues.filter(issue => issue.severity === 'error').length, warnings: applied.issues.filter(issue => issue.severity === 'warning').length },
  }
}

const { $defs } = structuredClone(DOCUMENT_CHANGE_JSON_SCHEMA) as { $defs: Record<string, unknown> }
export const EDITING_TOOLS: ToolSpec[] = [
  {
    name: 'rename_page', kind: 'operate', structured: true,
    description: 'Renames a page in one call. Give section as its 1-based number or stable ID and title. The workspace reads the current source, validates and saves through the existing transaction/history, and returns the exact saved title plus reported editor/preview synchronization. No capability, plan or readback calls are needed. Optional source refuses a stale edit. Optional requestId identifies the intent; after a lost response inspect current content instead of blindly repeating a write. No compilation or voice generation.',
    inputSchema: { type: 'object', additionalProperties: false, properties: { ...common, section: { oneOf: [{ type: 'integer', minimum: 1 }, fields.sectionId] }, title: fields.title }, required: ['section', 'title'] },
    run: async call => {
      const opened = await open(call), section = call.args.section
      const sectionId = typeof section === 'number' ? opened.current.content.sectionOrder[section - 1] : String(section)
      if (!sectionId || !opened.current.content.sections[sectionId]) throw Object.assign(new Error('no-such-section'), { status: 404 })
      return edit(call, opened, [{ type: 'updateSection', sectionId, title: String(call.args.title) }], sectionId)
    },
  },
  {
    name: 'edit_document', kind: 'operate', structured: true,
    description: 'Applies up to 32 canonical content operations in one call: text, page titles/layout, steps, narration, timing, blocks and assets. The operation schema is the same as DocumentChange. The workspace reads the current source, preflights and saves through the shared authoring transaction/history, and returns saved-source verification plus reported editor/preview synchronization. No separate capability, plan, apply or readback calls are needed. Pass source from a prior read to reject stale intent; an interleaving save always returns409 without retrying. No file changes, full-document replacement, compilation or paid service. After a lost response inspect current content before repeating a write.',
    inputSchema: { type: 'object', additionalProperties: false, properties: { ...common, operations: { type: 'array', minItems: 1, maxItems: 32, items: { $ref: '#/$defs/DocumentOperation' } } }, required: ['operations'], $defs },
    run: async call => edit(call, await open(call), call.args.operations as DocumentEditOperation[]),
  },
]
