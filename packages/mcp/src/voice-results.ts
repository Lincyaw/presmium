import { isRecord } from '@lincyaw/kernel'
import type { DocumentVoiceCatalogAnswer, VoiceoverJob, VoiceoverJobsAnswer, VoiceoverObservation, VoiceoverSnapshot } from '@lincyaw/kernel'
import { createHash } from 'node:crypto'

export const VOICE_PAGE_SCHEMA = {
  cursor: { type: 'string', minLength: 1, maxLength: 2048, pattern: '^[A-Za-z0-9_-]+$' },
  limit: { type: 'integer', minimum: 1, maximum: 20 },
} as const

function fail(status: number, code: string): never { throw Object.assign(new Error(code), { status }) }
const identity = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
export const VOICE_JOB_READ_SCHEMA = {
  cursor: VOICE_PAGE_SCHEMA.cursor,
  path: { type: 'array', maxItems: 8, items: { type: 'string', maxLength: 40, pattern: '^[^\\u0000-\\u001f]*$' } },
} as const
const preview = (text: string) => { let end = Math.min(text.length, 256); if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1]!)) end--; return text.slice(0, end) }
export const voiceJobSummary = (job: VoiceoverJob) => {
  const { scope, error, ...rest } = job
  return { ...rest, scope: scope.kind === 'steps' ? { kind: scope.kind, count: scope.targets.length } : scope,
    ...error ? { error: preview(error) } : {},
    ...scope.kind === 'steps' || (error?.length ?? 0) > 256 ? { detailsTruncated: true } : {},
  }
}

function decode(cursor: unknown, prefix: string): Record<string, unknown> {
  let value: unknown
  try { value = JSON.parse(Buffer.from(String(cursor), 'base64url').toString('utf8')) } catch { fail(400, `${prefix}-cursor-invalid`) }
  if (!isRecord(value)) fail(400, `${prefix}-cursor-invalid`)
  return value
}
function page<T, R>(rows: T[], args: Record<string, unknown>, version: string, key: (row: T) => string, render: (rows: T[], nextCursor?: string) => R, prefix = 'voice-read') {
  let from = 0
  if (args.cursor !== undefined) {
    const cursor = decode(args.cursor, prefix)
    if (typeof cursor.version !== 'string' || typeof cursor.after !== 'string') fail(400, `${prefix}-cursor-invalid`)
    if (cursor.version !== version) fail(409, `${prefix}-changed`)
    from = rows.findIndex(row => key(row) === cursor.after) + 1
    if (from === 0) fail(409, `${prefix}-changed`)
  }
  const selected: T[] = []
  let nextCursor: string | undefined
  for (let index = from; index < Math.min(rows.length, from + Number(args.limit ?? 8)); index++) {
    const row = rows[index]!, previous = nextCursor
    selected.push(row)
    nextCursor = index + 1 < rows.length ? Buffer.from(JSON.stringify({ version, after: key(row) })).toString('base64url') : undefined
    if (JSON.stringify(render(selected, nextCursor), null, 2).length <= 7168) continue
    selected.pop()
    if (previous === undefined) fail(413, `${prefix}-response-too-large`)
    nextCursor = previous
    break
  }
  const reply = render(selected, nextCursor)
  if (JSON.stringify(reply, null, 2).length > 7168) fail(413, `${prefix}-response-too-large`)
  return reply
}

/** Live native observations; continuation carries source/IR binding without another retained snapshot. */
export function voiceStatusPage(value: VoiceoverSnapshot, args: Record<string, unknown>) {
  const rows = [
    ...value.steps.map(step => ({ key: identity(['step', step.target]), step })),
    ...(value.unboundByPage ?? []).map(unbound => ({ key: identity(['unbound', unbound.section]), unbound })),
    ...value.jobs.map(job => ({ key: identity(['job', job.id]), job: voiceJobSummary(job) })),
  ]
  return page(rows, args, identity(['status', value.source, value.revision]), row => row.key, (selected, nextCursor) => ({
    source: value.source, revision: value.revision, capability: value.capability,
    steps: selected.flatMap(row => 'step' in row ? [row.step] : []),
    unboundByPage: selected.flatMap(row => 'unbound' in row ? [row.unbound] : []),
    jobs: selected.flatMap(row => 'job' in row ? [row.job] : []),
    totalSteps: value.steps.length, totalUnboundPages: value.unboundByPage?.length ?? 0, totalJobs: value.jobs.length,
    ...nextCursor ? { nextCursor } : {},
  }), 'voice-status')
}

export function voiceCatalogPage(value: DocumentVoiceCatalogAnswer, args: Record<string, unknown>) {
  const { catalog, ...metadata } = value, { voices, ...state } = catalog
  const query = isRecord(args.query) ? args.query : {}
  // Retain even duplicate provider IDs, assigning their occurrences distinct continuation identities.
  const occurrences = new Map<string, number>()
  const rows = voices.map(voice => { const index = occurrences.get(voice.id) ?? 0; occurrences.set(voice.id, index + 1); return { voice, key: identity([voice.id, index]) } })
  return page(rows, args, identity(['catalog', value.document, value.source, value.engine, query.engine, query.lang]), row => row.key,
    (selected, nextCursor) => ({ ...metadata, catalog: { ...state, voices: selected.map(row => row.voice) }, totalVoices: voices.length, ...nextCursor ? { nextCursor } : {} }))
}

export function voiceJobsPage(value: VoiceoverJobsAnswer, args: Record<string, unknown>) {
  const { jobs, ...metadata } = value
  return page(jobs, args, identity(['jobs', value.document]), job => identity(job.id),
    (selected, nextCursor) => ({ ...metadata, jobs: selected.map(voiceJobSummary), totalJobs: jobs.length, ...nextCursor ? { nextCursor } : {} }))
}

export function voiceObservationSummary(value: VoiceoverObservation) {
  const reply = { ...value, ...value.job ? { job: voiceJobSummary(value.job) } : {},
    ...value.error ? { error: preview(value.error), ...value.error.length > 256 ? { detailsTruncated: true } : {} } : {} }
  if (JSON.stringify(reply, null, 2).length > 7168) fail(413, 'voice-read-response-too-large')
  return reply
}

/** Explicit complete fields remain readable; a continuation pins selected JSON, not changing job progress. */
export function voiceJobRead(value: VoiceoverObservation, args: Record<string, unknown>) {
  if (args.path === undefined && args.cursor === undefined) return voiceObservationSummary(value)
  const cursor = args.cursor === undefined ? undefined : decode(args.cursor, 'voice-read')
  const path = cursor?.path ?? args.path ?? [], offset = cursor?.offset ?? 0
  if (!Array.isArray(path) || path.length > 8 || !path.every(key => typeof key === 'string' && key.length <= 40 && !/[\u0000-\u001f]/.test(key)) ||
    !Number.isSafeInteger(offset) || Number(offset) < 0 || (args.path !== undefined && JSON.stringify(args.path) !== JSON.stringify(path))) fail(400, 'voice-read-cursor-invalid')
  let selected: unknown = value
  for (const key of path as string[]) {
    if ((!isRecord(selected) && !Array.isArray(selected)) || !Object.hasOwn(selected, key) ||
      (Array.isArray(selected) && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= selected.length))) fail(404, 'voice-read-path-invalid')
    selected = (selected as Record<string, unknown>)[key]
  }
  if (selected === undefined) fail(404, 'voice-read-path-invalid')
  const text = JSON.stringify(selected), digest = identity([value.intent, value.job?.id, path, selected]), start = Number(offset)
  if (cursor && cursor.digest !== digest) fail(409, 'voice-read-changed')
  if (start > text.length || (start > 0 && /[\uDC00-\uDFFF]/.test(text[start]!) && /[\uD800-\uDBFF]/.test(text[start - 1]!))) fail(400, 'voice-read-cursor-invalid')
  const whole = { encoding: 'value', value: selected }
  if (!cursor && JSON.stringify(whole, null, 2).length <= 7168) return whole
  let end = Math.min(text.length, start + 2048)
  for (;;) {
    if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1]!)) end--
    const reply = { encoding: 'json-text-fragment', text: text.slice(start, end), totalChars: text.length,
      ...end < text.length ? { nextCursor: Buffer.from(JSON.stringify({ path, offset: end, digest })).toString('base64url') } : {} }
    if (JSON.stringify(reply, null, 2).length <= 7168) return reply
    if (end <= start + 2) fail(413, 'voice-read-response-too-large')
    end = start + Math.floor((end - start) / 2)
  }
}
