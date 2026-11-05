import { DOCUMENT_WORKSPACE_IMAGE_IMPORT_SCHEMA, DOCUMENT_WORKSPACE_IMAGE_INSPECTION_SCHEMA } from '@lincyaw/kernel'
import type { DocumentImageAuthoring, DocumentWorkspaceImageImport, DocumentWorkspaceImageInspect } from '@lincyaw/kernel'
import type { Call, ToolSpec } from './mcp.ts'
import { checkMediaWrite, mediaInput, mediaResult, prepareMediaArguments } from './media-input.ts'

const document = { type: 'string', description: 'The served document directory; file paths are workspace-relative within that document.' }
const input = (properties: Record<string, unknown>, required: string[]) => ({ type: 'object', properties: { document, ...properties }, required, additionalProperties: false })
const service = (call: Call): DocumentImageAuthoring => {
  if (!call.host.imageAuthoring) throw Object.assign(new Error('image-authoring-host-unavailable'), { status: 503 })
  return call.host.imageAuthoring
}
export const IMAGE_AUTHORING_TOOLS: ToolSpec[] = [
  {
    name: 'get_image_authoring_capabilities', kind: 'read', structured: true,
    description: 'Reports the actual workspace image authoring service, scope, byte limits, review state and bounded receipt lifetime. No image or document is changed. Compiler-only stdio reports unavailable.',
    inputSchema: input({}, []),
    run: async call => {
      if (!call.host.imageAuthoring) return { available: false, status: 'unavailable', reason: 'host-unavailable', actions: { inspectWorkspace: false, importWorkspace: false } }
      const capability = await service(call).capabilities(await call.document(), call.caller.member)
      return { ...capability, actions: { ...capability.actions, importWorkspace: capability.actions.importWorkspace && call.host.offers('operate') }, ...capability.actions.importWorkspace && !call.host.offers('operate') ? { importUnavailableReason: 'operation-disabled' } : {} }
    },
  },
  {
    name: 'inspect_workspace_image', kind: 'read', structured: true,
    description: 'Inspects one actual regular image file in the selected document scope. Returns exact source, original SHA-256, bytes and detected image dimensions and type; no import or full image decode occurs. Pass its exact file object to import_workspace_image.',
    inputSchema: input({ request: structuredClone(DOCUMENT_WORKSPACE_IMAGE_INSPECTION_SCHEMA) }, ['request']),
    run: async call => service(call).inspectWorkspace(await call.document(), call.args.request as DocumentWorkspaceImageInspect, call.caller.member, call.signal),
  },
  {
    name: 'import_workspace_image', kind: 'operate', structured: true,
    description: 'Imports one regular image using path or a ready upload reference. Source, original SHA-256 and length are pinned internally before approval; no separate inspection call is needed. Optional source pins an earlier read. request is advanced native input; details:true returns the existing verification receipt. Stale source and changed bytes are refused before approval and rechecked at commit. Uses the same Web image validation and canonical/binary transaction, exact source and original SHA-256/length, agent history origin, and process-local current-source receipt. Required review cannot be bypassed. Returns saved, assetId and dimensions; details:true or advanced request returns the existing verification receipt. Client-local uploads use prepare_media_upload; no scene compilation. After a lost response inspect saved assets instead of automatically repeating the import.',
    inputSchema: mediaInput(DOCUMENT_WORKSPACE_IMAGE_IMPORT_SCHEMA, { path: DOCUMENT_WORKSPACE_IMAGE_IMPORT_SCHEMA.properties.file.properties.path, upload: DOCUMENT_WORKSPACE_IMAGE_IMPORT_SCHEMA.properties.file.properties.upload }, ['path']),
    run: async call => {
      const selected = await call.document()
      if (call.args.request) checkMediaWrite(call, selected)
      const prepared = (call.args.request ?? (await prepareMediaArguments('import_workspace_image', call.args, async (name, args) => {
        call.signal.throwIfAborted()
        if (name === 'get_authoring_capabilities') return call.host.authoring?.capabilities(selected, call.caller.member)
        if (name === 'get_document_outline') return call.host.authoring?.outline(selected, {}, call.caller.member)
        return service(call).inspectWorkspace(selected, args.request as DocumentWorkspaceImageInspect, call.caller.member, call.signal)
      })).request) as DocumentWorkspaceImageImport
      const target = (await call.host.documents()).find(document => document.dir === selected)
      await call.approve('operate', messages => messages.importImage(prepared.file.path !== undefined ? (prepared.file.path.split('/').at(-1) ?? prepared.file.path) : prepared.file.name), { lang: target?.lang ?? '', detail: `${target?.title ?? selected}\n${prepared.file.path ?? prepared.file.name}`, check: () => service(call).checkWorkspaceImport(selected, prepared, call.caller.member, call.signal) })
      call.signal.throwIfAborted()
      const result = await service(call).importWorkspace(selected, prepared, call.caller.member, call.signal)
      if (!call.args.request && !call.args.details) return mediaResult('import_workspace_image', result, call.args)
      const { content: _content, issues: _issues, ...compact } = result
      return compact
    },
  },
]
