import { MEDIA_UPLOAD_PATH, MEDIA_UPLOAD_KINDS, MEDIA_LOCATION_PROPERTIES, hasRole } from '@lincyaw/kernel'
import type { MediaUploadKind } from '@lincyaw/kernel'
import type { ToolSpec } from './mcp.ts'
import { checkMediaWrite } from './media-input.ts'

export const MEDIA_UPLOAD_TOOLS: ToolSpec[] = [{
  name: 'prepare_media_upload', kind: 'read', structured: true, workspace: 'author',
  description: 'Prepare temporary client-local image/audio input, or read its upload status. Create with kind; open the returned URL to select a file, or let the MCP SDK transfer it outside model context. Read status with upload. Use ready uploads with existing image/audio imports, or audio uploads as clone_voice sample/consent.statement. Staging does not save a document or authorize import/training. Links expire; bytes are write-once and scoped to this member/document. Never send base64 through tool arguments.',
  inputSchema: { type: 'object', additionalProperties: false, properties: { document: { type: 'string', maxLength: 200 }, kind: { enum: [...MEDIA_UPLOAD_KINDS] }, upload: MEDIA_LOCATION_PROPERTIES.upload },
    oneOf: [{ required: ['kind'], not: { required: ['upload'] } }, { required: ['upload'], not: { required: ['kind'] } }] },
  run: async call => {
    if (!call.host.mediaUploads) throw Object.assign(new Error('media-upload-unavailable'), { status: 503 })
    const document = await call.document()
    if (!call.args.upload) {
      const cloneInput = call.args.kind === 'audio' && hasRole(call.caller.member, 'owner') && call.host.voiceAuthoring?.prepareClone && call.host.offers('spend')
      if (!cloneInput) {
        checkMediaWrite(call, document)
        if (!call.host.offers('operate')) throw Object.assign(new Error('operation-unavailable'), { status: 403 })
      }
    }
    const value = call.args.upload ? await call.host.mediaUploads.status(document, String(call.args.upload), call.caller.member)
      : await call.host.mediaUploads.prepare(document, call.args.kind as MediaUploadKind, call.caller.member)
    if (!call.caller.endpoint) return value
    const endpoint = new URL(call.caller.endpoint)
    return { ...value, url: `${endpoint.origin}${endpoint.pathname.replace(/\/mcp\/?$/, '')}${MEDIA_UPLOAD_PATH}/${value.upload}` }
  },
}]
