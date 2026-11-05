import { DOCUMENT_VOICE_CATALOG_SCHEMA, DOCUMENT_VOICE_CLONE_SCHEMA, DOCUMENT_VOICE_CLONE_QUERY_SCHEMA, VOICEOVER_JOB_QUERY_SCHEMA, VOICEOVER_START_SCHEMA, VOICEOVER_STATUS_SCHEMA, VOICE_PREVIEW_CHECK_SCHEMA, VOICE_PREVIEW_START_SCHEMA, hasRole } from '@lincyaw/kernel'
import type { DocumentVoiceCatalogQuery, DocumentVoiceCloneQuery, DocumentVoiceCloneRequest, VoiceCloneStatus, VoiceoverJobQuery, VoiceoverStart, VoiceoverStatusQuery, VoicePreviewCheck, VoicePreviewStart } from '@lincyaw/kernel'
import type { Call, ToolSpec } from './mcp.ts'
import type { ClonePreparationRequest } from './clone-protocol.ts'

const document = { type: 'string', description: 'The served document directory.' }
const input = (properties: Record<string, unknown>, required: string[] = []) => ({ type: 'object', additionalProperties: false, properties: { document, ...properties }, required })
const service = (call: Call) => {
  if (!call.host.voiceAuthoring) throw Object.assign(new Error('voice-authoring-host-unavailable'), { status: 503 })
  return call.host.voiceAuthoring
}
const language = async (call: Call, selected: string) => (await call.host.documents()).find(document => document.dir === selected)?.lang ?? ''

/** Only the authenticated trusted host may split native preparation from its own approval. */
export async function nativeCloneCall(call: Call, request: ClonePreparationRequest, available: boolean) {
  if (!call.caller.confirmed || !hasRole(call.caller.member, 'owner')) throw Object.assign(new Error('operation-unavailable'), { status: 403 })
  const owner = service(call)
  if (!owner.prepareCloneReference || !owner.runPreparedClone || !owner.releasePreparedClone) throw Object.assign(new Error('operation-unavailable'), { status: 503 })
  const document = await call.document()
  if (request.phase === 'release') return { released: owner.releasePreparedClone(document, request.prepared, call.caller.member) }
  if (!available || !call.host.offers('spend')) throw Object.assign(new Error('operation-unavailable'), { status: 403 })
  if (request.phase === 'prepare') {
    const prepared = await owner.prepareCloneReference(document, request.request, call.caller.member, call.signal)
    return { prepared: prepared.id, engine: prepared.engine, voice: prepared.voice }
  }
  if (request.phase === 'execute') return cloneResult(await owner.runPreparedClone(document, request.prepared, request.request, call.caller.member, call.signal))
  throw Object.assign(new Error('operation-unavailable'), { status: 400 })
}
export const VOICE_AUTHORING_TOOLS: ToolSpec[] = [
  {
    name: 'get_voice_clone_status', kind: 'read', structured: true, workspace: 'author',
    description: 'Reads the provider status of a cloned voice with its existing recorded consent. Requires owner access. This does not train a voice or synthesize audio. Use after an unknown clone acknowledgement; never blindly start training again.',
    inputSchema: { ...DOCUMENT_VOICE_CLONE_QUERY_SCHEMA, properties: { document, ...DOCUMENT_VOICE_CLONE_QUERY_SCHEMA.properties } },
    run: async call => {
      const { document: _document, ...query } = call.args
      return cloneResult(await service(call).cloneStatus!(await call.document(), query as unknown as DocumentVoiceCloneQuery, call.caller.member, call.signal))
    },
  },
  {
    name: 'clone_voice', kind: 'spend', structured: true, workspace: 'author',
    description: 'Trains an owned voice slot from a sample and the speaker’s recorded consent statement, after spending approval. sample and consent.statement each accept a workspace audio path or {upload} from prepare_media_upload, at most 10 MiB each. Uploads do not save assets or change the document. Consent names the actual speaker and scope. The original service fixes bytes before approval and records consent through the existing speech service. No automatic retry after a lost response; inspect clone status.',
    inputSchema: { ...DOCUMENT_VOICE_CLONE_SCHEMA, properties: { document, ...DOCUMENT_VOICE_CLONE_SCHEMA.properties } },
    run: async call => {
      const selected = await call.document(), { document: _document, ...request } = call.args
      const prepared = await service(call).prepareClone!(selected, request as unknown as DocumentVoiceCloneRequest, call.caller.member, call.signal)
      try {
        await call.approve('spend', messages => messages.cloneVoice(prepared.voice), { lang: await language(call, selected), detail: `${prepared.engine}: ${prepared.voice}` })
        call.signal.throwIfAborted()
        return cloneResult(await prepared.start(call.signal))
      } finally { prepared.close() }
    },
  },
  {
    name: 'get_voice_authoring_capabilities', kind: 'read', structured: true,
    description: 'Reads actual configured speech engines, default synthesis engine and installed voiceover/preview implementation for the canonical source. Configuration-only discovery does not verify provider authentication or generation success. No scene compilation or synthesis; compiler-only stdio reports host-unavailable.',
    inputSchema: { type: 'object', additionalProperties: false, properties: { document } },
    run: async call => {
      if (!call.host.voiceAuthoring) return { status: 'unavailable', reason: 'host-unavailable', voiceover: false, preview: false, engines: [], actions: { status: false, list: false, get: false, start: false, cancel: false, quotePreview: false, preview: false, readPreview: false } }
      const capability = await call.host.voiceAuthoring.capabilities(await call.document(), call.caller.member, call.signal)
      return { ...capability, actions: { ...capability.actions, start: capability.actions.start && call.host.offers('spend'), preview: capability.actions.preview && call.host.offers('spend'), clone: capability.actions.clone && call.host.offers('spend'), cancel: call.host.offers('operate') } }
    },
  },
  {
    name: 'get_voice_catalog', kind: 'read', structured: true,
    description: 'Reads the same real voice catalogue as Web, without compiling scenes or generating audio. Supply an optional expected canonical source, engine and language. Returns available/unavailable distinctly, actual engine declarations and the saved source; source changes during discovery are rejected. Unknown rate/style ranges remain absent.',
    inputSchema: { type: 'object', additionalProperties: false, properties: { document, query: structuredClone(DOCUMENT_VOICE_CATALOG_SCHEMA) } },
    run: async call => {
      if (!call.host.voiceAuthoring) throw Object.assign(new Error('voice-authoring-host-unavailable'), { status: 503 })
      return call.host.voiceAuthoring.catalog(await call.document(), call.args.query as DocumentVoiceCatalogQuery ?? {}, call.caller.member, call.signal)
    },
  },
  {
    name: 'get_voiceover_status', kind: 'read', structured: true,
    description: 'Reads the existing real IR voice targets, stable step IDs, exact-cache readiness and shared jobs. Does not compile or synthesize; if IR is missing or stale, explicitly read presmium://ir?document=<directory> first. Returned source and revision bind later generation. This status can read the real voice catalogue; use job list/get for discovery without services.',
    inputSchema: input({ query: structuredClone(VOICEOVER_STATUS_SCHEMA) }),
    run: async call => service(call).snapshot(await call.document(), call.args.query as VoiceoverStatusQuery ?? {}, call.caller.member, call.signal),
  },
  {
    name: 'get_voiceover_jobs', kind: 'read', structured: true,
    description: 'Lists real retained voiceover jobs from the same Workspace owner Web uses, with source, IR revision, monotonic sequence and current/old/unknown indication. No compilation, Node discovery, provider request or cache refresh. Jobs are process-local; no durable history is claimed.',
    inputSchema: input({}),
    run: async call => service(call).listJobs(await call.document(), call.caller.member),
  },
  {
    name: 'get_voiceover_job', kind: 'read', structured: true,
    description: 'Reads one real generation intent or task, including pre-admission cancellation without inventing a job. Poll by client intent after an unknown acknowledgement. Reads remain available with invalid canonical JSON or a changed document UUID and do not discover services or compile.',
    inputSchema: input({ query: structuredClone(VOICEOVER_JOB_QUERY_SCHEMA) }, ['query']),
    run: async call => service(call).getJob(await call.document(), call.args.query as VoiceoverJobQuery, call.caller.member),
  },
  {
    name: 'start_voiceover', kind: 'spend', structured: true,
    description: 'Explicitly generates exact-cache misses for a source/IR-bound scope after host spending approval. Uses the shared Web intent/job owner and existing per-document generation lock. Copy scope targets from get_voiceover_status; step numbers alone are insufficient. Same intent cannot change payload; a known admitted task is returned without charging again. Does not change narration, voices, canonical source or start playback.',
    inputSchema: input({ request: structuredClone(VOICEOVER_START_SCHEMA) }, ['request']),
    run: async call => {
      const selected = await call.document(), request = call.args.request as VoiceoverStart
      const scope = request.scope.kind === 'page' ? request.scope.section : request.scope.kind === 'step' ? request.scope.target.section : request.scope.kind
      await call.approve('spend', messages => messages.generateVoiceover(scope), { lang: await language(call, selected), detail: selected, check: () => service(call).checkStart(selected, request, call.caller.member, call.signal) })
      call.signal.throwIfAborted()
      return service(call).start(selected, request, call.caller.member, call.signal)
    },
  },
  {
    name: 'cancel_voiceover', kind: 'operate', structured: true,
    description: 'Cancels the original shared generation task, or records cancellation by client intent before admission. Does not compile, assemble services or synthesize. Reports cancelling until actual execution has stopped; completed cache entries remain real and are retained.',
    inputSchema: input({ query: structuredClone(VOICEOVER_JOB_QUERY_SCHEMA) }, ['query']),
    run: async call => {
      const selected = await call.document(), query = call.args.query as VoiceoverJobQuery
      const finished = await service(call).checkCancel(selected, query, call.caller.member)
      if (finished) return finished
      await call.approve('operate', messages => messages.cancelVoiceover('id' in query ? query.id : query.intent), { lang: await language(call, selected), detail: selected })
      call.signal.throwIfAborted()
      return service(call).cancel(selected, query, call.caller.member)
    },
  },
  {
    name: 'quote_voice_preview', kind: 'read', structured: true,
    description: 'Checks a real voice sample or bound step audition against exact source and existing IR. Returns actual text, provider, local/cache status and an expiring quote bound to the selected service instance. Does not synthesize or claim a price. A quote is not a playback acknowledgement.',
    inputSchema: input({ query: structuredClone(VOICE_PREVIEW_CHECK_SCHEMA) }, ['query']),
    run: async call => service(call).quotePreview(await call.document(), call.args.query as VoicePreviewCheck, call.caller.member, call.signal),
  },
  {
    name: 'preview_voice', kind: 'spend', structured: true,
    description: 'Creates real audition audio from an unchanged quote after host spending approval. Returns source/revision/key/provider/duration, byte length, SHA-256 and a bounded MCP audio resource URI; no data URI or audio bytes are dumped into text. Read that resource for actual audio. Generation success does not mean any browser or speaker played it.',
    inputSchema: input({ request: structuredClone(VOICE_PREVIEW_START_SCHEMA) }, ['request']),
    run: async call => {
      const selected = await call.document(), request = call.args.request as VoicePreviewStart
      await call.approve('spend', messages => messages.previewVoice(request.voice.voice), { lang: await language(call, selected), detail: selected, check: () => service(call).checkPreview(selected, request, call.caller.member, call.signal) })
      call.signal.throwIfAborted()
      const result = await service(call).preview(selected, request, call.caller.member, call.signal)
      return { ...result, uri: `presmium://voice-preview/${encodeURIComponent(result.id)}?document=${encodeURIComponent(selected)}` }
    },
  },
]

function cloneResult(status: VoiceCloneStatus) {
  return { engine: status.engine, voice: status.voice, state: status.state,
    ...status.trainingsLeft !== undefined ? { trainingsLeft: status.trainingsLeft } : {},
    ...status.state === 'failed' ? { error: 'voice-clone-failed' } : {} }
}
