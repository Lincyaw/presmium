import { DOCUMENT_RECORDING_ADOPTION_SCHEMA, DOCUMENT_AUDIO_INSPECTION_SCHEMA, DOCUMENT_AUDIO_WORKSPACE_IMPORT_SCHEMA, DOCUMENT_WORKSPACE_AUDIO_INSPECTION_SCHEMA, DOCUMENT_MEDIA_CLIP_VALIDATION_SCHEMA, DOCUMENT_MEDIA_CLIP_CHANGE_SCHEMA, DOCUMENT_PRODUCTION_PLAN_SCHEMA } from '@lincyaw/kernel'
import type { DocumentRecordingAdoption, DocumentAudioAuthoring, DocumentAudioInspect, DocumentWorkspaceAudioImport, DocumentWorkspaceAudioInspect, DocumentMediaClipValidation, DocumentMediaClipEdit, DocProductionPlanQuery } from '@lincyaw/kernel'
import type { Call, ToolSpec } from './mcp.ts'
import { checkMediaWrite, mediaInput, mediaResult, prepareMediaArguments } from './media-input.ts'

const document = { type: 'string', description: 'The served document directory; file paths remain workspace-relative within this selected document.' }
const input = (properties: Record<string, unknown>, required: string[]) => ({ type: 'object', properties: { document, ...properties }, required, additionalProperties: false })
const service = (call: Call): DocumentAudioAuthoring => {
  if (!call.host.audioAuthoring) throw Object.assign(new Error('audio-authoring-host-unavailable'), { status: 503 })
  return call.host.audioAuthoring
}

export const AUDIO_AUTHORING_TOOLS: ToolSpec[] = [
  {
    name: 'adopt_recording', kind: 'operate', structured: true,
    description: 'Adopts audio for a stable step using stepId and assetId. Optional sourceRange edits only an already adopted recording of this same asset in this step, against real inspected duration. Ordinary input is stepId and assetId; source and the asset SHA-256 are pinned internally before approval. Optional source pins an earlier read. Advanced request retains exact native fields. Preserves all narration, pronunciation, cues, ASR provenance and media clips. Trimmed narration keeps whole-step display captions with alignment:none and requires caption review; it does not align words or reuse whole-file ASR timing. Uses the shared Web canonical CAS/history/receipt boundary and cannot bypass required review. Unsupported cue timing is refused; no compilation, recognition, synthesis or implicit playback occurs. Read the real production plan after explicitly preparing IR to verify playback.',
    inputSchema: mediaInput(DOCUMENT_RECORDING_ADOPTION_SCHEMA, { stepId: DOCUMENT_RECORDING_ADOPTION_SCHEMA.properties.stepId, assetId: DOCUMENT_RECORDING_ADOPTION_SCHEMA.properties.assetId, sourceRange: DOCUMENT_RECORDING_ADOPTION_SCHEMA.properties.sourceRange }, ['stepId', 'assetId']),
    run: async call => {
      const selected = await call.document()
      if (call.args.request) checkMediaWrite(call, selected)
      const prepared = (call.args.request ?? (await prepareMediaArguments('adopt_recording', call.args, async (name, args) => {
        call.signal.throwIfAborted()
        if (name === 'get_authoring_capabilities') return call.host.authoring?.capabilities(selected, call.caller.member)
        if (name === 'get_document_outline') return call.host.authoring?.outline(selected, {}, call.caller.member)
        return service(call).inspect(selected, args.request as DocumentAudioInspect, call.caller.member, call.signal)
      })).request) as DocumentRecordingAdoption
      const target = (await call.host.documents()).find(document => document.dir === selected)
      await call.approve('operate', messages => messages.adoptRecording(prepared.stepId), { lang: target?.lang ?? '', detail: target?.title ?? selected, check: () => service(call).checkRecordingAdoption(selected, prepared, call.caller.member, call.signal) })
      call.signal.throwIfAborted()
      const result = await service(call).adoptRecording(selected, prepared, call.caller.member, call.signal)
      return mediaResult('adopt_recording', result, call.args)
    },
  },
  {
    name: 'get_audio_authoring_capabilities', kind: 'read', structured: true,
    description: 'Reports real canonical audio authoring support, local file scope, size limits, review requirements and receipt lifetime. Does not compile scenes, read audio bytes or recognize speech. Compiler-only stdio reports this workspace service unavailable.',
    inputSchema: input({}, []),
    run: async call => {
      if (!call.host.audioAuthoring) return { available: false, status: 'unavailable', reason: 'host-unavailable', actions: { inspect: false, inspectWorkspace: false, importWorkspace: false, readProductionPlan: false, validateClipChange: false, changeClip: false, adoptRecording: false } }
      const capability = await service(call).capabilities(await call.document(), call.caller.member)
      return { ...capability, actions: { ...capability.actions, importWorkspace: capability.actions.importWorkspace && call.host.offers('operate'), changeClip: capability.actions.changeClip && call.host.offers('operate'), adoptRecording: capability.actions.adoptRecording && call.host.offers('operate') },
        ...capability.actions.importWorkspace && !call.host.offers('operate') ? { importUnavailableReason: 'operation-disabled' } : {},
        ...capability.actions.changeClip && !call.host.offers('operate') ? { clipChangeUnavailableReason: 'operation-disabled' } : {} }
    },
  },
  {
    name: 'inspect_document_audio', kind: 'read', structured: true,
    description: 'Inspects a declared audio asset from the saved canonical document, including unused assets. Verifies exact source and actual bytes, duration and format through the same media service Web uses. No scene compilation or speech call.',
    inputSchema: input({ request: structuredClone(DOCUMENT_AUDIO_INSPECTION_SCHEMA) }, ['request']),
    run: async call => service(call).inspect(await call.document(), call.args.request as DocumentAudioInspect, call.caller.member, call.signal),
  },
  {
    name: 'inspect_workspace_audio', kind: 'read', structured: true,
    description: 'Inspects one permitted regular audio file in the selected document workspace scope, without importing it. Returns actual source, original SHA-256, byte length and media metadata; pass its exact file object to import_workspace_audio. No canonical asset identity is assigned, no scene is compiled and no speech provider is called.',
    inputSchema: input({ request: structuredClone(DOCUMENT_WORKSPACE_AUDIO_INSPECTION_SCHEMA) }, ['request']),
    run: async call => service(call).inspectWorkspace(await call.document(), call.args.request as DocumentWorkspaceAudioInspect, call.caller.member, call.signal),
  },
  {
    name: 'read_production_plan', kind: 'read', structured: true,
    description: 'Reads the real cache-only production plan for an exact saved source and an existing IR snapshot, optionally requiring a known IR revision. Returns the actual binding, confirmed or unknown step ranges and diagnostics without compiling, rendering or synthesizing. Missing IR is unavailable; explicitly read presmium://ir?document=<directory> when the snapshot needs preparation or refresh, then call this tool with source. Use its returned binding for media-clip changes; estimated timing is not confirmed timing.',
    inputSchema: input({ request: structuredClone(DOCUMENT_PRODUCTION_PLAN_SCHEMA) }, ['request']),
    run: async call => service(call).readProductionPlan(await call.document(), call.args.request as DocProductionPlanQuery, call.caller.member, call.signal),
  },
  {
    name: 'validate_media_clip_change', kind: 'read', structured: true,
    description: 'Checks one clip add, update or removal against exact saved source without writing. Upserts recheck real asset bytes and the current production binding, source range and confirmed step duration; removal needs no production plan. Returns the concrete before/after clip and affected steps/assets. This check creates no retained plan and apply checks everything again.',
    inputSchema: input({ request: structuredClone(DOCUMENT_MEDIA_CLIP_VALIDATION_SCHEMA) }, ['request']),
    run: async call => service(call).validateClipChange(await call.document(), call.args.request as DocumentMediaClipValidation, call.caller.member, call.signal),
  },
  {
    name: 'change_media_clip', kind: 'operate', structured: true,
    description: 'Adds, updates or removes one media clip after host authorization, using the same real validation, canonical CAS, lock, history transaction and receipts as Web. Uses agent origin and cannot bypass required review. Upserts require a current real production binding; removal remains available to repair a bad plan. Returns saved-source readback; it does not claim the new production plan or playback is ready.',
    inputSchema: input({ request: structuredClone(DOCUMENT_MEDIA_CLIP_CHANGE_SCHEMA) }, ['request']),
    run: async call => {
      const selected = await call.document(), request = call.args.request as DocumentMediaClipEdit, authoring = call.host.authoring?.capabilities(selected, call.caller.member)
      if (authoring && !authoring.actions.apply) throw Object.assign(new Error(authoring.applyUnavailableReason === 'review-required' ? 'authoring-review-required' : 'authoring-permission-denied'), { status: authoring.applyUnavailableReason ? 409 : 403 })
      const clipId = 'clip' in request ? request.clip.id : request.removeClipId
      const current = await call.host.authoring?.read(selected, call.caller.member)
      const action = 'removeClipId' in request ? 'remove' : current?.content.production.mediaClips.some(clip => clip.id === clipId) ? 'update' : 'add'
      const target = (await call.host.documents()).find(document => document.dir === selected)
      await call.approve('operate', messages => messages.changeMediaClip(action, clipId), { lang: target?.lang ?? '', detail: target?.title ?? selected, check: () => service(call).checkClipChange(selected, request, call.caller.member, call.signal) })
      call.signal.throwIfAborted()
      return service(call).changeClip(selected, request, call.caller.member, call.signal)
    },
  },
  {
    name: 'import_workspace_audio', kind: 'operate', structured: true,
    description: 'Imports one existing regular workspace audio file allowed by the selected document scope, after host authorization. Ordinary input is path; no separate source or inspection call is needed. Source, SHA-256 and byte length are pinned internally before approval, then rechecked by the native transaction. Optional source pins an earlier read; request is the advanced native input. Shares Web media validation, binary/document CAS, rollback and receipts; history origin is agent and required review cannot be bypassed. Ordinary response is saved, assetId and durationMs; details:true or advanced request returns the native receipt. Does not attach narration, recognize, synthesize or play. After a lost response inspect saved assets instead of automatically repeating the import.',
    inputSchema: mediaInput(DOCUMENT_AUDIO_WORKSPACE_IMPORT_SCHEMA, { path: DOCUMENT_AUDIO_WORKSPACE_IMPORT_SCHEMA.properties.file.properties.path, upload: DOCUMENT_AUDIO_WORKSPACE_IMPORT_SCHEMA.properties.file.properties.upload }, ['path']),
    run: async call => {
      const selected = await call.document()
      if (call.args.request) checkMediaWrite(call, selected)
      const prepared = (call.args.request ?? (await prepareMediaArguments('import_workspace_audio', call.args, async (name, args) => {
        call.signal.throwIfAborted()
        if (name === 'get_authoring_capabilities') return call.host.authoring?.capabilities(selected, call.caller.member)
        if (name === 'get_document_outline') return call.host.authoring?.outline(selected, {}, call.caller.member)
        return service(call).inspectWorkspace(selected, args.request as DocumentWorkspaceAudioInspect, call.caller.member, call.signal)
      })).request) as DocumentWorkspaceAudioImport
      const target = (await call.host.documents()).find(document => document.dir === selected)
      await call.approve('operate', messages => messages.importAudio(prepared.file.path !== undefined ? (prepared.file.path.split('/').at(-1) ?? prepared.file.path) : prepared.file.name), { lang: target?.lang ?? '', detail: `${target?.title ?? selected}\n${prepared.file.path ?? prepared.file.name}`, check: () => service(call).checkWorkspaceImport(selected, prepared, call.caller.member, call.signal) })
      call.signal.throwIfAborted()
      const result = await service(call).importWorkspace(selected, prepared, call.caller.member, call.signal)
      return mediaResult('import_workspace_audio', result, call.args)
    },
  },
]
