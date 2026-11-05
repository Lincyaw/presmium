import { DOCUMENT_TRANSCRIPTION_INPUT_SCHEMA, TRANSCRIPTION_ADOPTION_APPLY_SCHEMA, TRANSCRIPTION_ADOPTION_DRAFT_SCHEMA } from '@lincyaw/kernel'
import type { DocumentTranscriptionRequest, DocumentTranscriptions, TranscriptionAdoptionApply, TranscriptionAdoptionDraft, TranscriptionTask } from '@lincyaw/kernel'
import type { Call, ToolSpec } from './mcp.ts'

const document = { type: 'string', description: 'The served document directory, omitted only for one document or a document-bound token.' }
const id = { type: 'string', pattern: '^[a-f\\d]{64}$' }
const intent = { type: 'string', pattern: '^[A-Za-z\\d_-]{16,128}$' }
const query = { type: 'object', properties: { id, intent }, additionalProperties: false, oneOf: [{ required: ['id'], not: { required: ['intent'] } }, { required: ['intent'], not: { required: ['id'] } }] }
const input = (properties: Record<string, unknown>, required: string[]) => ({ type: 'object', properties: { document, ...properties }, required, additionalProperties: false })
function service(call: Call): DocumentTranscriptions {
  if (!call.host.transcriptions) throw Object.assign(new Error('transcription-host-unavailable'), { status: 503 })
  return call.host.transcriptions
}
const language = async (call: Call, selected: string) => (await call.host.documents()).find(document => document.dir === selected)?.lang ?? ''

/** Discovery stays small; the existing single-task query retains the complete native record. */
async function readTasks(call: Call) {
  const value = await service(call).list(await call.document(), call.caller.member)
  call.signal.throwIfAborted()
  const preview = (text: string, limit: number) => text.slice(0, text.length > limit && /[\uD800-\uDBFF]/.test(text[limit - 1]!) ? limit - 1 : limit)
  const summary = (task: TranscriptionTask) => ({ id: task.id, intent: task.intent, sequence: task.sequence, state: task.state, current: task.current,
    ...task.staleReason ? { staleReason: task.staleReason } : {}, progress: { phase: task.progress.phase }, createdAt: preview(task.createdAt, 64),
    ...task.result ? { result: { transcriptionId: task.result.transcriptionId, revision: task.result.revision } } : {},
    ...task.error ? { error: preview(task.error, 256) } : {},
    ...task.createdAt.length > 64 || (task.error?.length ?? 0) > 256 ? { detailsTruncated: true } : {},
  })
  const rows = [
    ...value.tasks.map(task => ({ cursor: `task:${task.id}`, task: summary(task) })),
    ...value.issues.map(issue => ({ cursor: `issue:${issue.id}`, issue: { id: issue.id, code: issue.code } })),
  ]
  const previous = call.args.cursor, from = previous === undefined ? 0 : rows.findIndex(row => row.cursor === previous) + 1
  if (previous !== undefined && from === 0) throw Object.assign(new Error('transcription-list-changed'), { status: 409 })
  const reply: { tasks: ReturnType<typeof summary>[], issues: typeof value.issues, totalTasks: number, totalIssues: number, truncated?: true, nextCursor?: string } = {
    tasks: [], issues: [], totalTasks: value.tasks.length, totalIssues: value.issues.length, ...value.truncated ? { truncated: true } : {},
  }
  for (let index = from; index < Math.min(rows.length, from + Number(call.args.limit ?? 8)); index++) {
    const row = rows[index]!, last = reply.nextCursor
    if ('task' in row) reply.tasks.push(row.task)
    else reply.issues.push(row.issue)
    if (index + 1 < rows.length) reply.nextCursor = row.cursor
    else delete reply.nextCursor
    if (JSON.stringify(reply, null, 2).length <= 7168) continue
    if ('task' in row) reply.tasks.pop()
    else reply.issues.pop()
    if (last === undefined) throw Object.assign(new Error('transcription-list-entry-too-large'), { status: 413 })
    reply.nextCursor = last
    break
  }
  return reply
}

/** Candidate identity already pins every fragment; do not add a second verification token. */
async function readResult(call: Call) {
  const candidate = await service(call).readResult(await call.document(), String(call.args.id), String(call.args.revision), call.caller.member)
  const path = (call.args.path ?? []) as string[], offset = Number(call.args.offset ?? 0)
  const fail = (status: number, code: string): never => { throw Object.assign(new Error(code), { status }) }
  let value: unknown = candidate
  for (const key of path) {
    if (!value || typeof value !== 'object' || !Object.hasOwn(value, key) || Array.isArray(value) && !/^(0|[1-9][0-9]*)$/.test(key)) return fail(404, 'transcription-result-field-missing')
    value = (value as Record<string, unknown>)[key]
  }
  if (value === undefined) return fail(404, 'transcription-result-field-missing')
  const text = JSON.stringify(value), boundary = (index: number) => !(index > 0 && index < text.length && /[\uD800-\uDBFF]/.test(text[index - 1]!) && /[\uDC00-\uDFFF]/.test(text[index]!))
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > text.length || !boundary(offset)) return fail(400, 'transcription-result-offset-invalid')
  const base = { transcriptionId: candidate.transcriptionId, revision: candidate.revision, path }, fits = (reply: unknown) => JSON.stringify(reply, null, 2).length <= 7168
  const whole = call.args.path === undefined ? candidate : { ...base, encoding: 'value', complete: true, value }
  if (offset === 0 && text.length <= 2048 && fits(whole)) return whole
  const fragment = (end: number) => ({ ...base, encoding: 'json-text-fragment', offsetUnit: 'utf16', offset, ...end < text.length ? { nextOffset: end } : {}, totalChars: text.length, complete: end === text.length, text: text.slice(offset, end) })
  let low = offset, high = Math.min(text.length, offset + 2048)
  while (low < high) { const middle = Math.ceil((low + high) / 2); if (fits(fragment(middle))) low = middle; else high = middle - 1 }
  if (!boundary(low)) low--
  if (low < offset || low === offset && offset < text.length || !fits(fragment(low))) return fail(413, 'transcription-result-response-too-large')
  return fragment(low)
}

export const TRANSCRIPTION_TOOLS: ToolSpec[] = [
  {
    name: 'get_transcription_capabilities', kind: 'read', structured: true,
    description: 'Actual transcription configuration for the selected canonical document, without compiling scenes or starting speech. Engine declaration does not verify provider authentication. Lists query/start/cancel support separately; compiler-only stdio reports this authoring service unavailable.',
    inputSchema: input({}, []),
    run: async call => {
      if (!call.host.transcriptions) return { available: false, status: 'unavailable', reason: 'host-unavailable', actions: { list: false, read: false, readResult: false, start: false, cancel: false, planAdoption: false, applyAdoption: false } }
      const selected = await call.document(), capability = await service(call).capabilities(selected, call.caller.member)
      const authoring = call.host.authoring?.capabilities(selected, call.caller.member)
      return { ...capability, actions: { list: true, read: true, readResult: true, start: capability.available && call.host.offers('spend'), cancel: call.host.offers('operate'), planAdoption: Boolean(call.host.transcriptionAdoption), applyAdoption: Boolean(call.host.transcriptionAdoption && authoring?.actions.apply && call.host.offers('operate')) }, ...!call.host.offers('spend') ? { startUnavailableReason: 'spending-disabled' } : {}, ...authoring?.applyUnavailableReason ? { adoptionUnavailableReason: authoring.applyUnavailableReason } : {} }
    },
  },
  {
    name: 'start_transcription', kind: 'spend', structured: true,
    description: 'Explicitly recognizes the selected saved audio through its real configured provider after host authorization. Uses the workspace HTTP task instance, exact source and audio digest, and client intent. Returns a pollable task without adopting text, selecting a voice or starting TTS. Confirmation is injected by the trusted host, never supplied in request.',
    inputSchema: input({ request: structuredClone(DOCUMENT_TRANSCRIPTION_INPUT_SCHEMA) }, ['request']),
    run: async call => {
      const selected = await call.document(), request: DocumentTranscriptionRequest = { ...(call.args.request as Omit<DocumentTranscriptionRequest, 'confirmed'>), confirmed: true }
      await call.approve('spend', messages => messages.startTranscription, { lang: await language(call, selected), check: () => service(call).checkStart(selected, request, call.caller.member, call.signal) })
      call.signal.throwIfAborted()
      return service(call).start(selected, request, call.caller.member, call.signal)
    },
  },
  {
    name: 'get_transcriptions', kind: 'read', structured: true,
    description: 'Discovers real workspace transcription tasks in bounded live pages: at most 7168 pretty-JSON characters, default 8 rows, maximum 20. Continue with nextCursor as cursor; no source or snapshot parameter. New earlier tasks appear on a fresh first page; a removed cursor returns 409. Summaries retain IDs, state, progress, sequence, current/stale indication and result identity; get_transcription reads complete details. Reports corrupt records as issues. Invalid current JSON remains observable as stale. Does not load services, compile or call ASR.',
    inputSchema: input({ cursor: { type: 'string', minLength: 6, maxLength: 520, pattern: '^(task|issue):[^\\u0000]+$' }, limit: { type: 'integer', minimum: 1, maximum: 20 } }, []),
    run: readTasks,
  },
  {
    name: 'get_transcription', kind: 'read', structured: true,
    description: 'Polls the same workspace transcription by task id or client intent, with sequence, real state, source and staleness. Does not load speech services or compile. Use id when malformed current JSON prevents intent lookup.',
    inputSchema: input({ query }, ['query']),
    run: async call => service(call).get(await call.document(), call.args.query as { id: string } | { intent: string }, call.caller.member),
  },
  {
    name: 'get_transcription_result', kind: 'read', structured: true,
    description: 'Read immutable transcription material by id/revision. Optional path selects own JSON fields or canonical array indices. Small results retain their value; large ones return UTF-16 JSON-text fragments, at most 2048 decoded characters and 7168 response characters. Follow nextOffset with the same id/revision and path; assemble text before parsing. No extra verification token or provider call.',
    inputSchema: input({ id, revision: id, path: { type: 'array', maxItems: 8, items: { type: 'string', minLength: 1, maxLength: 200 } }, offset: { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER } }, ['id', 'revision']),
    run: readResult,
  },
  {
    name: 'cancel_transcription', kind: 'operate', structured: true,
    description: 'Cancels the original task or records cancellation by client intent before admission, using the workspace task instance. Reports actual cancelling/cancelled state and never compiles or reopens a speech provider. An existing id can be cancelled when canonical JSON is invalid.',
    inputSchema: input({ query }, ['query']),
    run: async call => {
      const selected = await call.document(), query = call.args.query as { id: string } | { intent: string }
      const finished = await service(call).checkCancel(selected, query, call.caller.member)
      if (finished) return finished
      await call.approve('operate', messages => messages.cancelTranscription, { lang: await language(call, selected) })
      call.signal.throwIfAborted()
      return service(call).cancel(selected, query, call.caller.member)
    },
  },
  {
    name: 'plan_transcription_adoption', kind: 'read', structured: true,
    description: 'Previews explicit transcription segments for stable target steps, preserving pronunciation and cue atoms or reporting conflicts. Validates the immutable candidate and original audio, then returns the same DocumentEditor planId used by Web; conflicts have no planId. Does not modify canonical narration or call ASR/TTS.',
    inputSchema: input({ draft: structuredClone(TRANSCRIPTION_ADOPTION_DRAFT_SCHEMA) }, ['draft']),
    run: async call => {
      if (!call.host.transcriptionAdoption) throw Object.assign(new Error('adoption-host-unavailable'), { status: 503 })
      return call.host.transcriptionAdoption.plan(await call.document(), call.args.draft as TranscriptionAdoptionDraft, call.caller.member)
    },
  },
  {
    name: 'apply_transcription_adoption', kind: 'operate', structured: true,
    description: 'Adopts an unchanged source/candidate/draftRevision and the planId from plan_transcription_adoption through the shared canonical transaction. Origin is always agent on this tool and required review cannot be bypassed. No raw replacement, confirmation, voice switch, synthesis or timing fabrication can be supplied in the request.',
    inputSchema: input({ request: structuredClone(TRANSCRIPTION_ADOPTION_APPLY_SCHEMA) }, ['request']),
    run: async call => {
      if (!call.host.transcriptionAdoption || !call.host.authoring) throw Object.assign(new Error('adoption-host-unavailable'), { status: 503 })
      const selected = await call.document(), capability = call.host.authoring.capabilities(selected, call.caller.member)
      if (!capability.actions.apply) throw Object.assign(new Error(capability.applyUnavailableReason === 'review-required' ? 'authoring-review-required' : 'authoring-permission-denied'), { status: capability.applyUnavailableReason ? 409 : 403 })
      await call.approve('operate', messages => messages.adoptTranscription, { lang: await language(call, selected), check: () => call.host.transcriptionAdoption!.check(selected, call.args.request as TranscriptionAdoptionApply, call.caller.member) })
      call.signal.throwIfAborted()
      return call.host.transcriptionAdoption.apply(selected, call.args.request as TranscriptionAdoptionApply, call.caller.member)
    },
  },
]
