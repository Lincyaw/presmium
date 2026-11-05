import { isRecord } from '@lincyaw/kernel'
import type { CanonicalSource } from '@lincyaw/kernel'
import type { Call } from './mcp.ts'

/** Ordinary fields come from the native request schema; the complete SDK request stays available. */
export function mediaInput(schema: { properties: Record<string, unknown> }, fields: Record<string, unknown>, required: string[]) {
  const ordinary = { ...fields, source: schema.properties.source, ...schema.properties.id ? { requestId: schema.properties.id } : {} }
  const modes = required.includes('path') && fields.upload ? [required, required.map(key => key === 'path' ? 'upload' : key)] : [required]
  return { type: 'object', additionalProperties: false,
    properties: { document: { type: 'string', maxLength: 200 }, ...ordinary,
      details: { type: 'boolean', description: 'Include native verification details for diagnostics.' },
      request: { ...structuredClone(schema), description: 'Advanced native request. Cannot be mixed with ordinary fields.' } },
    oneOf: [
      ...modes.map(keys => ({ required: keys, not: { anyOf: [{ required: ['request'] }, ...fields.upload ? [{ required: [keys.includes('upload') ? 'path' : 'upload'] }] : []] } })),
      { required: ['request'], not: { anyOf: Object.keys(ordinary).map(key => ({ required: [key] })) } },
    ],
  }
}

export function checkMediaWrite(call: Call, document: string) {
  const capability = call.host.authoring?.capabilities(document, call.caller.member)
  if (capability && !capability.actions.apply) throw Object.assign(new Error(capability.applyUnavailableReason === 'review-required' ? 'authoring-review-required' : 'authoring-permission-denied'), { status: capability.applyUnavailableReason ? 409 : 403 })
}

export const isOrdinaryMediaCall = (name: string, args: Record<string, unknown>) => ['import_workspace_audio', 'import_workspace_image', 'adopt_recording'].includes(name) && args.request === undefined

/** Stateless preparation shared by external MCP and the trusted Harness before its approval. */
export async function prepareMediaArguments(name: string, args: Record<string, unknown>, read: (name: string, args: Record<string, unknown>) => Promise<unknown>): Promise<Record<string, unknown>> {
  if (!isOrdinaryMediaCall(name, args)) throw new Error('operation-unavailable')
  const document = args.document === undefined ? {} : { document: args.document }
  const capability = await read('get_authoring_capabilities', document)
  if (!isRecord(capability) || capability.reason === 'host-unavailable') throw Object.assign(new Error('authoring-host-unavailable'), { status: 503 })
  if (!isRecord(capability.actions) || !capability.actions.apply) throw Object.assign(new Error(capability.applyUnavailableReason === 'review-required' ? 'authoring-review-required' : 'authoring-permission-denied'), { status: capability.applyUnavailableReason ? 409 : 403 })
  const value = await read('get_document_outline', document)
  if (!isRecord(value) || !isRecord(value.source) || typeof value.source.documentId !== 'string' || typeof value.source.version !== 'string' || typeof value.source.fingerprint !== 'string') throw new Error('media-response-invalid')
  const source: CanonicalSource = { documentId: value.source.documentId, version: value.source.version, fingerprint: value.source.fingerprint }
  const expected = args.source as CanonicalSource | undefined
  if (expected && (expected.documentId !== source.documentId || expected.version !== source.version || expected.fingerprint !== source.fingerprint)) throw Object.assign(new Error('document-version-changed'), { status: 409, detail: { currentSource: source } })
  const id = String(args.requestId ?? globalThis.crypto.randomUUID())
  let request: Record<string, unknown>
  if (name === 'adopt_recording') {
    const result = await read('inspect_document_audio', { ...document, request: { source, assetId: args.assetId } })
    if (!isRecord(result) || !isRecord(result.inspection) || typeof result.inspection.sha256 !== 'string') throw new Error('media-response-invalid')
    request = { id, source, stepId: args.stepId, assetId: args.assetId, sha256: result.inspection.sha256, ...args.sourceRange ? { sourceRange: args.sourceRange } : {} }
  } else {
    const result = await read(name === 'import_workspace_audio' ? 'inspect_workspace_audio' : 'inspect_workspace_image', { ...document, request: { source, ...args.upload ? { upload: args.upload } : { path: args.path } } })
    if (!isRecord(result) || !isRecord(result.file)) throw new Error('media-response-invalid')
    request = { id, source, file: result.file }
  }
  return { ...document, request, ...args.details !== undefined ? { details: args.details } : {} }
}

/** Native successful receipts only; transport and source verification stay inside the host. */
export function mediaResult(name: string, value: unknown, original: Record<string, unknown>): unknown {
  if (original.request || original.details) return value
  if (!isRecord(value) || !isRecord(value.verification) || value.verification.saved !== true) throw new Error('media-response-invalid')
  if (name === 'adopt_recording') {
    const verified = value.verification
    return { saved: true, stepId: verified.stepId, assetId: verified.assetId, durationMs: verified.durationMs,
      ...verified.sourceRange ? { sourceRange: verified.sourceRange, usedDurationMs: verified.usedDurationMs } : {} }
  }
  return { saved: true, assetId: value.assetId, ...name === 'import_workspace_audio' && isRecord(value.inspection) ? { durationMs: value.inspection.durationMs } : { dimensions: value.dimensions } }
}
