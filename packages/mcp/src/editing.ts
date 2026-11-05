import { randomUUID } from 'node:crypto'
import { AUTHORING_CLIENT_MAX_CLIENTS, DOCUMENT_PAGE_DUPLICATION_SCHEMA, deckLocale, errorMessage, narrationCaptionText, replaceStepNarrationText } from '@lincyaw/kernel'
import { DOCUMENT_CHANGE_JSON_SCHEMA } from '@lincyaw/kernel/node'
import type { AuthoringClientDescriptor, CanonicalSource, DocumentAnswer, DocumentChange, DocumentEditOperation, TeachingDocument } from '@lincyaw/kernel'
import type { Call, ToolSpec } from './mcp.ts'
import { documentChangeSummary, MCP_MESSAGES } from './messages.ts'

const fields = DOCUMENT_PAGE_DUPLICATION_SCHEMA.properties
const common = { document: { type: 'string', maxLength: 200 }, source: fields.source, requestId: fields.id,
  details: { type: 'boolean', description: 'Include source and verification details for diagnostics; omitted for ordinary edits.' } }
const sameSource = (a: CanonicalSource | undefined, b: CanonicalSource) => a?.documentId === b.documentId && a.version === b.version && a.fingerprint === b.fingerprint
const sourceOf = (value: DocumentAnswer): CanonicalSource => ({ documentId: value.content.id, version: value.version, fingerprint: value.fingerprint })

async function open(call: Call, write = true) {
  if (JSON.stringify(call.args).length > 32768) throw Object.assign(new Error('document-edit-request-too-large'), { status: 413 })
  const own = call.host.authoring
  if (!own) throw Object.assign(new Error('authoring-host-unavailable'), { status: 503 })
  const capability = own.capabilities(await call.document(), call.caller.member)
  if (write && !capability.actions.apply) throw Object.assign(new Error(capability.applyUnavailableReason === 'review-required' ? 'authoring-review-required' : 'authoring-permission-denied'), { status: capability.applyUnavailableReason ? 409 : 403 })
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

async function edit(call: Call, opened: Awaited<ReturnType<typeof open>>, changes: DocumentEditOperation[] | TeachingDocument, sectionId?: string) {
  const { own, document, current, source } = opened
  const change: DocumentChange = { id: String(call.args.requestId ?? randomUUID()), baseDocumentVersion: source.version,
    ...Array.isArray(changes) ? { operations: changes } : { replacement: changes } }
  const plan = await own.plan(document, change, call.caller.member)
  const summary = documentChangeSummary(MCP_MESSAGES[deckLocale(current.content.metadata.lang)], change, current.content)
  await call.approve('operate', messages => messages.applyDocumentChange, { lang: current.content.metadata.lang, detail: summary, check: () => own.checkApply(document, { change, planId: plan.planId }, call.caller.member) })
  call.signal.throwIfAborted()
  const applied = await own.apply(document, { change, planId: plan.planId }, call.caller.member)
  const saved = sourceOf(applied)
  const editor = await editorFeedback(call, document, saved)
  const page = sectionId ? { page: applied.content.sectionOrder.indexOf(sectionId) + 1, title: applied.content.sections[sectionId]!.title } : {}
  if (!call.args.details) return { saved: true, changed: saved.version !== source.version, ...page, editor: editor.status }
  return {
    document, changeId: applied.changeId, changed: saved.version !== source.version, source: saved, summary: summary.slice(0, 1200), summaryComplete: summary.length <= 1200,
    ...sectionId ? { page: { sectionId, number: applied.content.sectionOrder.indexOf(sectionId) + 1, title: applied.content.sections[sectionId]!.title } } : {},
    ...applied.commit ? { commit: { id: applied.commit.id } } : {},
    verification: { saved: true, sourceReadback: true, compiled: 'not-requested', editor },
    validation: { errors: applied.issues.filter(issue => issue.severity === 'error').length, warnings: applied.issues.filter(issue => issue.severity === 'warning').length },
  }
}

const { $defs } = structuredClone(DOCUMENT_CHANGE_JSON_SCHEMA) as { $defs: Record<string, unknown> }
const section = { oneOf: [{ type: 'integer', minimum: 1 }, fields.sectionId] }
const targetFields = { document: common.document, section, step: { type: 'integer', minimum: 0 } }

async function target(call: Call, opened: Awaited<ReturnType<typeof open>>, write = false) {
  let selected: AuthoringClientDescriptor | undefined
  let position: string | undefined
  if (call.args.section === undefined && call.host.authoringClients) {
    let after: string | undefined
    for (let page = 0; page < AUTHORING_CLIENT_MAX_CLIENTS; page++) {
      const report = await call.host.authoringClients.list(opened.document, after ? { after } : {}, call.caller.member)
      for (const client of report.clients) if (client.connected && (client.snapshot.view === 'document' || client.snapshot.mode === 'production') && client.snapshot.position) {
        const key = JSON.stringify(client.snapshot.position)
        if (position && key !== position) throw Object.assign(new Error('editor-context-unavailable'), { status: 409 })
        position = key
        if (!selected || client.observedAt > selected.observedAt) selected = client
      }
      after = report.nextAfter
      if (!after) break
    }
  }
  if (write && selected && (!sameSource(selected.snapshot.source, opened.source) || Object.values(selected.snapshot.editing).some(Boolean))) throw Object.assign(new Error('editor-context-unavailable'), { status: 409 })
  const page = call.args.section ?? selected?.snapshot.position?.sectionId
  const sectionId = typeof page === 'number' ? opened.current.content.sectionOrder[page - 1] : typeof page === 'string' ? page : undefined
  const current = sectionId ? opened.current.content.sections[sectionId] : undefined
  if (!current) throw Object.assign(new Error(page === undefined ? 'editor-context-unavailable' : 'no-such-section'), { status: page === undefined ? 409 : 404 })
  const stepId = call.args.step === undefined && selected?.snapshot.position?.stepId
    ? selected.snapshot.position.stepId : current.stepOrder[Number(call.args.step ?? 0)]
  const step = stepId ? opened.current.content.steps[stepId] : undefined
  if (!step || step.sectionId !== sectionId) throw Object.assign(new Error('document-narration-target'), { status: 404 })
  return { section: current, step, page: opened.current.content.sectionOrder.indexOf(sectionId!) + 1, stepIndex: current.stepOrder.indexOf(step.id),
    ...selected ? { editor: !sameSource(selected.snapshot.source, opened.source) ? 'stale' : Object.values(selected.snapshot.editing).some(Boolean) ? 'pending' : 'current' } : {} }
}

export const EDITING_TOOLS: ToolSpec[] = [
  {
    name: 'get_context', kind: 'read', structured: true, workspace: 'author',
    description: 'Reads the current editor page and step, title, narration with aligned stable narrationIds, and reported text selection. Omit section/step to use the active editor; no source versions, compilation or draft mutation.',
    inputSchema: { type: 'object', additionalProperties: false, properties: targetFields },
    run: async call => {
      const opened = await open(call, false), context = await target(call, opened)
      const focus = call.host.focus?.(opened.document)?.focus.find(item => item.section === context.section.id)
      let remaining = 2000, truncated = false
      const narrationIds: string[] = []
      if (context.step.narrationIds.length > 12) truncated = true
      const narration = context.step.narrationIds.slice(0, 12).flatMap(id => {
        if (remaining <= 0) { truncated = true; return [] }
        const full = narrationCaptionText(opened.current.content.narrations[id]!.content)
        narrationIds.push(id)
        const text = full.slice(0, remaining); remaining -= text.length
        if (text.length !== full.length) truncated = true
        return [text]
      })
      if (context.section.title.length > 160 || (context.step.title?.length ?? 0) > 160 || (focus?.quote ?? focus?.excerpt ?? '').length > 500) truncated = true
      return { document: opened.document, page: context.page, pageId: context.section.id, title: context.section.title.slice(0, 160), step: context.stepIndex, stepId: context.step.id,
        ...context.editor ? { editor: context.editor } : {},
        blocks: context.step.visuals.slice(0, 12).map(visual => ({ id: visual.blockId, type: opened.current.content.blocks[visual.blockId]?.type })), narrationIds,
        ...context.step.title ? { stepTitle: context.step.title.slice(0, 160) } : {}, narration,
        ...focus ? { selectedText: (focus.quote ?? focus.excerpt).slice(0, 500) } : {}, ...truncated || context.step.visuals.length > 12 ? { truncated: true } : {} }
    },
  },
  {
    name: 'edit_narration', kind: 'operate', structured: true,
    description: 'Edit the active step’s script: find/replace a unique phrase, or remove a block by stable narration ID (get_context) or 1-based index. replace:"" deletes text. remove handles cue/pronunciation-only blocks and preserves shared references. After a lost reply, read current blocks before retrying.',
    inputSchema: { type: 'object', additionalProperties: false, properties: { ...targetFields, find: { type: 'string', minLength: 1, maxLength: 4096 }, replace: { type: 'string', maxLength: 4096 }, remove: { oneOf: [{ type: 'integer', minimum: 1 }, fields.sectionId], description: 'One stable narration ID or 1-based block index in this step; prefer its ID after a read.' }, details: common.details },
      oneOf: [{ required: ['find', 'replace'], not: { required: ['remove'] } }, { required: ['remove'], not: { anyOf: ['find', 'replace'].map(key => ({ required: [key] })) } }] },
    run: async call => {
      const opened = await open(call), context = await target(call, opened, true)
      let content: TeachingDocument | DocumentEditOperation[]
      if (call.args.remove !== undefined) {
        const id = typeof call.args.remove === 'number' ? context.step.narrationIds[call.args.remove - 1] : String(call.args.remove)
        if (!id || !context.step.narrationIds.includes(id)) throw Object.assign(new Error('document-narration-target'), { status: 409 })
        content = [{ type: 'removeNarration', stepId: context.step.id, narrationId: id }]
      } else {
        try { content = replaceStepNarrationText(opened.current.content, context.step.id, String(call.args.find), String(call.args.replace)) }
        catch (error) { throw Object.assign(error as Error, { status: 409 }) }
      }
      return { ...await edit(call, opened, content), page: context.page, step: context.stepIndex }
    },
  },
  {
    name: 'rename_page', kind: 'operate', structured: true,
    description: 'Rename one page by its 1-based number or stable ID and new title. The host validates and saves once, returning a short receipt. Optional source pins an earlier read; details:true exposes diagnostics. After a lost reply, read current state before retrying.',
    inputSchema: { type: 'object', additionalProperties: false, properties: { ...common, section, title: fields.title }, required: ['section', 'title'] },
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
