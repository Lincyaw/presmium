import { join, sep } from 'node:path'
import { diagnosticOf, fnv1a64 } from '@lincyaw/kernel'
import { irRevision } from '@lincyaw/kernel/node'
import type { DiagnosticSnapshot, Finding, IRDocument } from '@lincyaw/kernel'
import type { McpHost } from './host.ts'
import type { Call, ToolSpec } from './mcp.ts'
import { relativeToDeck } from './deck.ts'

const RESPONSE_LIMIT = 7168
const REQUEST_LIMIT = 2048
const snapshots = new WeakMap<McpHost, Map<string, { compilation: string, snapshot: DiagnosticSnapshot }>>()
const fail = (status: number, message: string): never => { throw Object.assign(new Error(message), { status }) }
const fits = (value: unknown) => JSON.stringify(value, null, 2).length <= RESPONSE_LIMIT
const boundary = (text: string, offset: number) => !(offset > 0 && offset < text.length && /[\uD800-\uDBFF]/.test(text[offset - 1]!) && /[\uDC00-\uDFFF]/.test(text[offset]!))

function remember(host: McpHost, document: string, doc: IRDocument, findings: Finding[], origin: 'compile' | 'check'): DiagnosticSnapshot {
  let documents = snapshots.get(host)
  if (!documents) snapshots.set(host, documents = new Map())
  const previous = documents.get(document), compilation = irRevision(doc)
  const diagnostics = findings.map(finding => diagnosticOf(document, origin, {
    ...finding,
    ...finding.source ? { source: { ...finding.source, file: join(document, relativeToDeck(doc, { ...finding.source, line: finding.source.line ?? 1 }).file).split(sep).join('/') } } : {},
  }))
  const same = previous?.compilation === compilation && JSON.stringify(previous.snapshot.diagnostics) === JSON.stringify(diagnostics)
  const snapshot = same ? previous.snapshot : { version: (previous?.snapshot.version ?? 0) + 1, diagnostics }
  documents.set(document, { compilation, snapshot })
  return snapshot
}

/** Legacy compiler-only resources can compile; passive tools only read actual observations. */
export async function diagnosticSnapshot(call: Call): Promise<DiagnosticSnapshot> {
  const document = await call.document()
  if (call.host.diagnostics) return call.host.diagnostics(document)
  const { doc, diagnostics } = await call.compiled(), previous = snapshots.get(call.host)?.get(document)
  if (previous?.compilation === irRevision(doc)) return previous.snapshot
  return remember(call.host, document, doc, diagnostics, 'compile')
}

function query(call: Call) {
  if (JSON.stringify(call.args).length > REQUEST_LIMIT) return fail(413, 'diagnostic-read-request-too-large')
  if (Object.keys(call.args).some(key => !['document', 'version', 'digest', 'offset'].includes(key))) return fail(400, 'diagnostic-read-query-invalid')
  const { version, digest, offset = 0 } = call.args
  if (call.args.document !== undefined && (typeof call.args.document !== 'string' || call.args.document.length > 200)) return fail(400, 'diagnostic-read-document-invalid')
  if (version !== undefined && (!Number.isSafeInteger(version) || Number(version) < 0)) return fail(400, 'diagnostic-read-version-invalid')
  if (digest !== undefined && (typeof digest !== 'string' || !/^[a-f\d]{16}$/.test(digest))) return fail(400, 'diagnostic-read-digest-invalid')
  if (!Number.isSafeInteger(offset) || Number(offset) < 0) return fail(400, 'diagnostic-read-offset-invalid')
  if (Number(offset) > 0 && (version === undefined || digest === undefined)) return fail(400, 'diagnostic-read-continuation-required')
  return { version, digest, offset: Number(offset) }
}

async function read(call: Call) {
  const asked = query(call), document = await call.document()
  const snapshot = call.host.diagnostics ? await call.host.diagnostics(document) : snapshots.get(call.host)?.get(document)?.snapshot
  if (!snapshot) return { document, available: false, reason: 'snapshot-unavailable', verification: 'unobserved', next: 'check_document' }
  const text = JSON.stringify(snapshot), digest = fnv1a64(text)
  if (asked.version !== undefined && asked.version !== snapshot.version || asked.digest !== undefined && asked.digest !== digest) return fail(409, 'diagnostic-snapshot-changed')
  if (asked.offset > text.length || !boundary(text, asked.offset)) return fail(400, 'diagnostic-read-offset-invalid')
  const base = { document, available: true, version: snapshot.version, digest, verification: 'unobserved' as const }
  const whole = { ...base, encoding: 'value', complete: true, value: snapshot }
  if (asked.offset === 0 && fits(whole)) return whole
  const fragment = (end: number) => ({ ...base, encoding: 'json-text-fragment', offsetUnit: 'utf16', offset: asked.offset,
    ...end < text.length ? { nextOffset: end } : {}, totalChars: text.length, complete: end === text.length, text: text.slice(asked.offset, end) })
  let low = asked.offset, high = text.length
  while (low < high) { const mid = Math.ceil((low + high) / 2); if (fits(fragment(mid))) low = mid; else high = mid - 1 }
  if (!boundary(text, low)) low--
  if (low === asked.offset && low < text.length || !fits(fragment(low))) return fail(413, 'diagnostic-read-response-too-large')
  return fragment(low)
}

async function check(call: Call) {
  if (Object.keys(call.args).some(key => key !== 'document') || call.args.document !== undefined && (typeof call.args.document !== 'string' || call.args.document.length > 200)) return fail(400, 'diagnostic-check-query-invalid')
  const document = await call.document()
  // Hosts with a real diagnostic producer publish their own check contribution.
  const compiled = call.host.diagnostics ? undefined : await call.compiled()
  const findings = await call.host.check(document)
  call.signal.throwIfAborted()
  const snapshot = call.host.diagnostics ? await call.host.diagnostics(document) : remember(call.host, document, compiled!.doc, findings, 'check')
  return { document, completed: true, findings: { total: findings.length,
    errors: findings.filter(finding => finding.severity === 'error').length,
    warnings: findings.filter(finding => finding.severity === 'warning').length,
    infos: findings.filter(finding => finding.severity === 'info').length },
    snapshot: { version: snapshot.version, digest: fnv1a64(JSON.stringify(snapshot)) },
    verification: { currentSource: 'unverified', browser: 'unobserved' }, next: 'get_diagnostics' }
}

export const DIAGNOSTIC_TOOLS: ToolSpec[] = [
  {
    name: 'get_diagnostics', kind: 'read', structured: true,
    description: 'Reads the same current diagnostic snapshot as the workbench, without compiling or running plugin checks. Entries retain their origins and reported revisions; an empty snapshot does not verify current source or browser health. Replies fit 7168 pretty-JSON UTF-16 characters. encoding:value contains the complete snapshot; json-text-fragment requires concatenating decoded text in nextOffset order then JSON.parse once. Continue with the returned version AND digest; changed snapshots return 409. Digest is fnv1a64 of JSON.stringify(snapshot). No snapshot producer or prior observation returns unavailable. Use check_document only when explicitly requesting compilation and plugin checks.',
    inputSchema: { type: 'object', additionalProperties: false, properties: {
      document: { type: 'string', maxLength: 200 }, version: { type: 'integer', minimum: 0 }, digest: { type: 'string', pattern: '^[a-f\\d]{16}$' }, offset: { type: 'integer', minimum: 0 },
    } },
    run: read,
  },
  {
    name: 'check_document', kind: 'read', structured: true,
    description: 'Explicitly runs document compilation and plugin checks. Returns bounded counts and the actual diagnostic snapshot version/digest; read full observations with get_diagnostics. It does not synthesize speech, export, play or prove a browser rendered the current source. Checks can execute project plugin code and may take time; do not use this tool merely to read current problems. Current-source verification is not established by these counts.',
    inputSchema: { type: 'object', additionalProperties: false, properties: { document: { type: 'string', maxLength: 200 } } },
    run: check,
  },
]
