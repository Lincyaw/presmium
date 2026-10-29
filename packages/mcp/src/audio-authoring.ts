import { DOCUMENT_RECORDING_ADOPTION_SCHEMA, DOCUMENT_AUDIO_INSPECTION_SCHEMA, DOCUMENT_AUDIO_WORKSPACE_IMPORT_SCHEMA, DOCUMENT_WORKSPACE_AUDIO_INSPECTION_SCHEMA, DOCUMENT_MEDIA_CLIP_VALIDATION_SCHEMA, DOCUMENT_MEDIA_CLIP_CHANGE_SCHEMA, DOCUMENT_PRODUCTION_PLAN_SCHEMA } from '@lincyaw/kernel'
import type { DocumentRecordingAdoption, DocumentAudioAuthoring, DocumentAudioInspect, DocumentWorkspaceAudioImport, DocumentWorkspaceAudioInspect, DocumentMediaClipValidation, DocumentMediaClipEdit, DocProductionPlanQuery } from '@lincyaw/kernel'
import type { Call, ToolSpec } from './mcp.ts'

const document = { type: 'string', description: 'The served document directory; file paths remain workspace-relative within this selected document.' }
const input = (properties: Record<string, unknown>, required: string[]) => ({ type: 'object', properties: { document, ...properties }, required, additionalProperties: false })
const service = (call: Call): DocumentAudioAuthoring => {
  if (!call.host.audioAuthoring) throw Object.assign(new Error('audio-authoring-host-unavailable'), { status: 503 })
  return call.host.audioAuthoring
}

export const AUDIO_AUTHORING_TOOLS: ToolSpec[] = [
  {
    name: 'adopt_recording', kind: 'operate', structured: true,
    description: 'Explicitly adopts one whole local audio asset as the narration source for one stable step. Optional sourceRange edits only an already adopted recording of this same asset in this step, against real inspected duration. Requires exact saved source and original SHA-256; preserves all narration, pronunciation, cues, ASR provenance and media clips. Trimmed narration keeps whole-step display captions with alignment:none and requires caption review; it does not align words or reuse whole-file ASR timing. Uses the shared Web canonical CAS/history/receipt boundary and cannot bypass required review. Unsupported cue timing is refused; no compilation, recognition, synthesis or implicit playback occurs. Read the real production plan after explicitly preparing IR to verify playback.',
    inputSchema: input({ request: structuredClone(DOCUMENT_RECORDING_ADOPTION_SCHEMA) }, ['request']),
    run: async call => {
      const selected = await call.document(), request = call.args.request as DocumentRecordingAdoption, authoring = call.host.authoring?.capabilities(selected, call.caller.member)
      if (authoring && !authoring.actions.apply) throw Object.assign(new Error(authoring.applyUnavailableReason === 'review-required' ? 'authoring-review-required' : 'authoring-permission-denied'), { status: authoring.applyUnavailableReason ? 409 : 403 })
      const target = (await call.host.documents()).find(document => document.dir === selected)
      await call.approve('operate', messages => messages.adoptRecording(request.stepId), { lang: target?.lang ?? '', detail: target?.title ?? selected, check: () => service(call).checkRecordingAdoption(selected, request, call.caller.member, call.signal) })
      call.signal.throwIfAborted()
      return service(call).adoptRecording(selected, request, call.caller.member, call.signal)
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
    description: 'Imports one existing regular workspace audio file allowed by the selected document scope, after host authorization. Requires exact canonical source, expected original SHA-256 and byte length. Shares Web media validation, binary/document CAS, rollback and receipts; history origin is agent and required review cannot be bypassed. Returns saved-source and actual-file verification, without clips, narration, recognition, synthesis or playback.',
    inputSchema: input({ request: structuredClone(DOCUMENT_AUDIO_WORKSPACE_IMPORT_SCHEMA) }, ['request']),
    run: async call => {
      const selected = await call.document(), request = call.args.request as DocumentWorkspaceAudioImport, authoring = call.host.authoring?.capabilities(selected, call.caller.member)
      if (authoring && !authoring.actions.apply) throw Object.assign(new Error(authoring.applyUnavailableReason === 'review-required' ? 'authoring-review-required' : 'authoring-permission-denied'), { status: authoring.applyUnavailableReason ? 409 : 403 })
      const target = (await call.host.documents()).find(document => document.dir === selected)
      await call.approve('operate', messages => messages.importAudio(request.file.path.split('/').at(-1) ?? request.file.path), { lang: target?.lang ?? '', detail: `${target?.title ?? selected}\n${request.file.path}`, check: () => service(call).checkWorkspaceImport(selected, request, call.caller.member, call.signal) })
      call.signal.throwIfAborted()
      return service(call).importWorkspace(selected, request, call.caller.member, call.signal)
    },
  },
]
