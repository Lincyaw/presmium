import { DOCUMENT_WORKSPACE_IMAGE_IMPORT_SCHEMA, DOCUMENT_WORKSPACE_IMAGE_INSPECTION_SCHEMA } from '@lincyaw/kernel'
import type { DocumentImageAuthoring, DocumentWorkspaceImageImport, DocumentWorkspaceImageInspect } from '@lincyaw/kernel'
import type { Call, ToolSpec } from './mcp.ts'

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
    description: 'Imports one regular image from the selected document scope after authorization; a stale source or changed file is refused before authorization is asked. Uses the same Web image validation and canonical/binary transaction, exact source and original SHA-256/length, agent history origin, and process-local current-source receipt. Required review cannot be bypassed. Returns verified saved asset metadata; no remote upload, scene compilation or runtime verification is implied.',
    inputSchema: input({ request: structuredClone(DOCUMENT_WORKSPACE_IMAGE_IMPORT_SCHEMA) }, ['request']),
    run: async call => {
      const selected = await call.document(), request = call.args.request as DocumentWorkspaceImageImport, authoring = call.host.authoring?.capabilities(selected, call.caller.member)
      if (authoring && !authoring.actions.apply) throw Object.assign(new Error(authoring.applyUnavailableReason === 'review-required' ? 'authoring-review-required' : 'authoring-permission-denied'), { status: authoring.applyUnavailableReason ? 409 : 403 })
      const target = (await call.host.documents()).find(document => document.dir === selected)
      await call.approve('operate', messages => messages.importImage(request.file.path.split('/').at(-1) ?? request.file.path), { lang: target?.lang ?? '', detail: `${target?.title ?? selected}\n${request.file.path}`, check: () => service(call).checkWorkspaceImport(selected, request, call.caller.member, call.signal) })
      call.signal.throwIfAborted()
      const result = await service(call).importWorkspace(selected, request, call.caller.member, call.signal)
      const { content: _content, issues: _issues, ...compact } = result
      return compact
    },
  },
]
