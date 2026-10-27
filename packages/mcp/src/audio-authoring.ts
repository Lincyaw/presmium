import { DOCUMENT_AUDIO_INSPECTION_SCHEMA, DOCUMENT_AUDIO_WORKSPACE_IMPORT_SCHEMA, DOCUMENT_WORKSPACE_AUDIO_INSPECTION_SCHEMA } from '@lincyaw/kernel'
import type { DocumentAudioAuthoring, DocumentAudioInspect, DocumentWorkspaceAudioImport, DocumentWorkspaceAudioInspect } from '@lincyaw/kernel'
import type { Call, ToolSpec } from './mcp.ts'

const document = { type: 'string', description: 'The served document directory; file paths remain workspace-relative within this selected document.' }
const input = (properties: Record<string, unknown>, required: string[]) => ({ type: 'object', properties: { document, ...properties }, required, additionalProperties: false })
const service = (call: Call): DocumentAudioAuthoring => {
  if (!call.host.audioAuthoring) throw Object.assign(new Error('audio-authoring-host-unavailable'), { status: 503 })
  return call.host.audioAuthoring
}

export const AUDIO_AUTHORING_TOOLS: ToolSpec[] = [
  {
    name: 'get_audio_authoring_capabilities', kind: 'read', structured: true,
    description: 'Reports real canonical audio authoring support, local file scope, size limits, review requirements and receipt lifetime. Does not compile scenes, read audio bytes or recognize speech. Compiler-only stdio reports this workspace service unavailable.',
    inputSchema: input({}, []),
    run: async call => {
      if (!call.host.audioAuthoring) return { available: false, status: 'unavailable', reason: 'host-unavailable', actions: { inspect: false, inspectWorkspace: false, importWorkspace: false } }
      const capability = await service(call).capabilities(await call.document(), call.caller.member)
      return { ...capability, actions: { ...capability.actions, importWorkspace: capability.actions.importWorkspace && call.host.offers('operate') },
        ...capability.actions.importWorkspace && !call.host.offers('operate') ? { importUnavailableReason: 'operation-disabled' } : {} }
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
    name: 'import_workspace_audio', kind: 'operate', structured: true,
    description: 'Imports one existing regular workspace audio file allowed by the selected document scope, after host authorization. Requires exact canonical source, expected original SHA-256 and byte length. Shares Web media validation, binary/document CAS, rollback and receipts; history origin is agent and required review cannot be bypassed. Returns saved-source and actual-file verification, without clips, narration, recognition, synthesis or playback.',
    inputSchema: input({ request: structuredClone(DOCUMENT_AUDIO_WORKSPACE_IMPORT_SCHEMA) }, ['request']),
    run: async call => {
      const selected = await call.document(), request = call.args.request as DocumentWorkspaceAudioImport, authoring = call.host.authoring?.capabilities(selected, call.caller.member)
      if (authoring && !authoring.actions.apply) throw Object.assign(new Error(authoring.applyUnavailableReason === 'review-required' ? 'authoring-review-required' : 'authoring-permission-denied'), { status: authoring.applyUnavailableReason ? 409 : 403 })
      const target = (await call.host.documents()).find(document => document.dir === selected)
      await call.approve('operate', messages => messages.importAudio(request.file.path.split('/').at(-1) ?? request.file.path), { lang: target?.lang ?? '', detail: `${target?.title ?? selected}\n${request.file.path}` })
      call.signal.throwIfAborted()
      return service(call).importWorkspace(selected, request, call.caller.member, call.signal)
    },
  },
]
