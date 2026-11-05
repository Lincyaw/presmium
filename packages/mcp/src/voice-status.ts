import { isRecord } from '@lincyaw/kernel'
import type { VoiceoverJob, VoiceoverSnapshot } from '@lincyaw/kernel'
import { createHash } from 'node:crypto'

export const VOICE_STATUS_PAGE_SCHEMA = {
  cursor: { type: 'string', minLength: 1, maxLength: 2048, pattern: '^[A-Za-z0-9_-]+$' },
  limit: { type: 'integer', minimum: 1, maximum: 20 },
} as const

function fail(status: number, code: string): never { throw Object.assign(new Error(code), { status }) }
const identity = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const jobSummary = (job: VoiceoverJob) => {
  const { scope, error, ...rest } = job
  return { ...rest, scope: scope.kind === 'steps' ? { kind: scope.kind, count: scope.targets.length } : scope,
    ...error ? { error: error.slice(0, 256), ...error.length > 256 ? { detailsTruncated: true } : {} } : {},
  }
}

/** Live native observations; continuation binds their source and IR without retaining another snapshot. */
export function voiceStatusPage(value: VoiceoverSnapshot, args: Record<string, unknown>) {
  const version = identity([value.source, value.revision])
  const rows = [
    ...value.steps.map(step => ({ key: identity(['step', step.target]), step })),
    ...(value.unboundByPage ?? []).map(unbound => ({ key: identity(['unbound', unbound.section]), unbound })),
    ...value.jobs.map(job => ({ key: identity(['job', job.id]), job: jobSummary(job) })),
  ]
  let from = 0
  if (args.cursor !== undefined) {
    let cursor: unknown
    try { cursor = JSON.parse(Buffer.from(String(args.cursor), 'base64url').toString('utf8')) }
    catch { fail(400, 'voice-status-cursor-invalid') }
    if (!isRecord(cursor) || typeof cursor.version !== 'string' || typeof cursor.after !== 'string') fail(400, 'voice-status-cursor-invalid')
    if (cursor.version !== version) fail(409, 'voice-status-changed')
    from = rows.findIndex(row => row.key === cursor.after) + 1
    if (from === 0) fail(409, 'voice-status-changed')
  }
  const reply: {
    source: VoiceoverSnapshot['source'], revision: string, capability: VoiceoverSnapshot['capability'],
    steps: VoiceoverSnapshot['steps'], unboundByPage: NonNullable<VoiceoverSnapshot['unboundByPage']>,
    jobs: ReturnType<typeof jobSummary>[], totalSteps: number, totalUnboundPages: number, totalJobs: number, nextCursor?: string,
  } = { source: value.source, revision: value.revision, capability: value.capability, steps: [], unboundByPage: [], jobs: [],
    totalSteps: value.steps.length, totalUnboundPages: value.unboundByPage?.length ?? 0, totalJobs: value.jobs.length }
  for (let index = from; index < Math.min(rows.length, from + Number(args.limit ?? 8)); index++) {
    const row = rows[index]!, previous = reply.nextCursor
    if ('step' in row) reply.steps.push(row.step)
    else if ('unbound' in row) reply.unboundByPage.push(row.unbound)
    else reply.jobs.push(row.job)
    if (index + 1 < rows.length) reply.nextCursor = Buffer.from(JSON.stringify({ version, after: row.key })).toString('base64url')
    else delete reply.nextCursor
    if (JSON.stringify(reply, null, 2).length <= 7168) continue
    if ('step' in row) reply.steps.pop()
    else if ('unbound' in row) reply.unboundByPage.pop()
    else reply.jobs.pop()
    if (previous === undefined) fail(413, 'voice-status-response-too-large')
    reply.nextCursor = previous
    break
  }
  if (JSON.stringify(reply, null, 2).length > 7168) fail(413, 'voice-status-response-too-large')
  return reply
}
