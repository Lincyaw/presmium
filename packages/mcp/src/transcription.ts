import { DOCUMENT_TRANSCRIPTION_INPUT_SCHEMA, TRANSCRIPTION_ADOPTION_APPLY_SCHEMA, TRANSCRIPTION_ADOPTION_DRAFT_SCHEMA } from '@lincyaw/kernel'
import type { DocumentTranscriptionRequest, DocumentTranscriptions, TranscriptionAdoptionApply, TranscriptionAdoptionDraft } from '@lincyaw/kernel'
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
      const selected = await call.document()
      await call.approve('spend', messages => messages.tool('start_transcription'), { lang: await language(call, selected), detail: JSON.stringify({ document: selected, request: call.args.request }) })
      call.signal.throwIfAborted()
      return service(call).start(selected, { ...(call.args.request as Omit<DocumentTranscriptionRequest, 'confirmed'>), confirmed: true }, call.caller.member, call.signal)
    },
  },
  {
    name: 'get_transcriptions', kind: 'read', structured: true,
    description: 'Discovers real workspace transcription tasks from active state and bounded durable journals. Reports corrupt records as issues, never completed tasks. Invalid current JSON and an older document UUID remain observable as stale; this read does not load services, compile or call ASR.',
    inputSchema: input({}, []),
    run: async call => service(call).list(await call.document(), call.caller.member),
  },
  {
    name: 'get_transcription', kind: 'read', structured: true,
    description: 'Polls the same workspace transcription by task id or client intent, with sequence, real state, source and staleness. Does not load speech services or compile. Use id when malformed current JSON prevents intent lookup.',
    inputSchema: input({ query }, ['query']),
    run: async call => service(call).get(await call.document(), call.args.query as { id: string } | { intent: string }, call.caller.member),
  },
  {
    name: 'get_transcription_result', kind: 'read', structured: true,
    description: 'Reads one immutable transcription candidate at its exact id and revision, including real provider provenance and available segment/word timing. It does not overwrite canonical narration, re-align timestamps or synthesize audio.',
    inputSchema: input({ id, revision: id }, ['id', 'revision']),
    run: async call => service(call).readResult(await call.document(), String(call.args.id), String(call.args.revision), call.caller.member),
  },
  {
    name: 'cancel_transcription', kind: 'operate', structured: true,
    description: 'Cancels the original task or records cancellation by client intent before admission, using the workspace task instance. Reports actual cancelling/cancelled state and never compiles or reopens a speech provider. An existing id can be cancelled when canonical JSON is invalid.',
    inputSchema: input({ query }, ['query']),
    run: async call => {
      const selected = await call.document()
      await call.approve('operate', messages => messages.tool('cancel_transcription'), { lang: await language(call, selected), detail: JSON.stringify({ document: selected, query: call.args.query }) })
      call.signal.throwIfAborted()
      return service(call).cancel(selected, call.args.query as { id: string } | { intent: string }, call.caller.member)
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
      await call.approve('operate', messages => messages.tool('apply_transcription_adoption'), { lang: await language(call, selected), detail: JSON.stringify({ document: selected, request: call.args.request }) })
      call.signal.throwIfAborted()
      return call.host.transcriptionAdoption.apply(selected, call.args.request as TranscriptionAdoptionApply, call.caller.member)
    },
  },
]
