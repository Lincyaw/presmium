import { createHash } from 'node:crypto'
import { basename, extname } from 'node:path'
import type { Context, Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { fnv1a64, isRecord } from '@lincyaw/kernel'
import type { CompileJob, JobSource, OutputTarget, TeachingDocument } from '@lincyaw/kernel'
import { CloudError, requireId, requireInteger } from '../domain/errors.ts'
import type { Membership } from '../domain/plans.ts'
import { documentText } from './documents.ts'
import type { RuntimeJobInput, RuntimeOutput } from './runner.ts'
import type { WorkbenchRouteDependencies } from './workbench-routes.ts'

interface JobRow {
  id: string, user_id: string, input: RuntimeJobInput, kind: 'compile' | 'export', state: string, output: RuntimeOutput[] | null,
  error_code: string | null, created_at: Date, started_at: Date | null, finished_at: Date | null, updated_at: Date,
  content: TeachingDocument, log: string | null,
}
const base = '/api/spaces/:sid/presmium'
const targets: OutputTarget[] = [
  { id: 'web', kind: 'render', label: { 'zh-CN': '网页', en: 'Web page' } },
  { id: 'slides', kind: 'render', label: { 'zh-CN': '幻灯片', en: 'Slides' } },
  { id: 'pdf', kind: 'export', label: { 'zh-CN': 'PDF', en: 'PDF' } },
  { id: 'notebook', kind: 'render', label: { 'zh-CN': 'Notebook', en: 'Notebook' } },
]
const studentTarget: OutputTarget = { id: 'web-student', kind: 'render', label: { 'zh-CN': '公开阅读版', en: 'Public reading edition' } }
const mediaTypes: Record<string, string> = { '.html': 'text/html', '.pdf': 'application/pdf', '.ipynb': 'application/x-ipynb+json', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.css': 'text/css', '.js': 'text/javascript', '.txt': 'text/plain' }
const targetOf = (row: JobRow) => row.input.audience === 'student' ? 'web-student' : row.input.format ?? row.input.form
// Preserve ordering even when two forward state transitions share a JS millisecond.
const sequenceOf = (row: JobRow) => row.updated_at.getTime() * 8 + Math.max(0, ['queued', 'starting', 'running', 'publishing', 'succeeded', 'failed', 'cancelled'].indexOf(row.state))
const sha = (value: Uint8Array) => createHash('sha256').update(value).digest('hex')

/** The ordinary workspace output protocol, backed by the same isolated runner as preview preparation. */
export function workbenchOutputRoutes(app: Hono, deps: WorkbenchRouteDependencies) {
  const streams = new Set<AbortController>()
  const revisions = new Map<string, string>()
  const identity = async (c: Context, mutation = false) => {
    const user = await (mutation ? deps.mutate : deps.current)(c.req.raw)
    const spaceId = requireId(c.req.param('sid')), document = requireId(c.req.query('document'))
    const [member] = await Promise.all([deps.spaces.authorize(user.id, spaceId, 'read'), deps.documents.read(user.id, spaceId, document)])
    return { user, member, spaceId, document }
  }
  const admission = () => { if (!deps.admission) throw new CloudError(503, 'cloud-compilation-unavailable'); return deps.admission }
  const rows = async (spaceId: string, document: string, id?: string): Promise<JobRow[]> => (await deps.db.query<JobRow>(`SELECT j.id,j.user_id,j.input,j.kind,j.state,j.output,j.error_code,j.created_at,j.started_at,j.finished_at,j.updated_at,j.log,v.content
    FROM cloud_runtime_jobs j JOIN document_versions v ON v.id=(j.input->>'sourceVersion')::uuid AND v.document_id=$2
    WHERE j.workspace_id=$1 AND j.input->>'documentId'=$2::text AND ($3::uuid IS NULL OR j.id=$3)
    ORDER BY j.created_at DESC,j.id DESC LIMIT 100`, [spaceId, document, id ?? null])).rows
  const row = async (spaceId: string, document: string, id: string) => {
    const found = (await rows(spaceId, document, requireId(id)))[0]
    if (!found) throw new CloudError(404, 'runtime-job-not-found')
    return found
  }
  const metadataRevision = async (spaceId: string, job: JobRow, source: JobSource): Promise<string> => {
    const known = revisions.get(job.id)
    if (known) return known
    const file = job.output?.find(file => file.path === '_presmium/job.json')
    if (!file || !deps.storage) return '' // Older output did not record a captured IR revision.
    if (file.bytes > 4096 || !file.key || file.key !== `spaces/${spaceId}/${file.sha256}`) throw new CloudError(409, 'cloud-output-manifest-invalid')
    const object = await deps.storage.get(spaceId, file.key)
    if (object.bytes !== file.bytes || object.sha256 !== file.sha256) { await object.body.cancel(); throw new CloudError(409, 'cloud-output-object-changed') }
    const bytes = new Uint8Array(await new Response(object.body).arrayBuffer())
    if (bytes.byteLength !== file.bytes || sha(bytes) !== file.sha256) throw new CloudError(409, 'cloud-output-object-changed')
    let value: unknown
    try { value = JSON.parse(new TextDecoder().decode(bytes)) } catch { throw new CloudError(409, 'cloud-output-provenance-invalid') }
    const entry = job.input.files.find(file => file.path === job.input.entry)
    if (!isRecord(value) || typeof value.revision !== 'string' || !/^[a-f0-9]{16}$/.test(value.revision) || !isRecord(value.source) || !entry || value.source.documentId !== job.content.id || value.source.fingerprint !== source.fingerprint || value.source.version !== entry.sha256.slice(0, 20)) throw new CloudError(409, 'cloud-output-provenance-invalid')
    revisions.set(job.id, value.revision)
    if (revisions.size > 256) revisions.delete(revisions.keys().next().value!)
    return value.revision
  }
  const present = async (member: Pick<Membership, 'userId' | 'role'>, spaceId: string, document: string, job: JobRow): Promise<CompileJob> => {
    const source = { version: job.input.sourceVersion, fingerprint: fnv1a64(documentText(job.content)) }
    const state: CompileJob['state'] = job.state === 'succeeded' ? 'done' : job.state === 'failed' || job.state === 'cancelled' ? job.state : job.state === 'queued' ? 'queued' : 'running'
    const output = (job.output ?? []).map((file, index) => ({ ...file, index })).filter(file => !file.path.startsWith('_presmium/'))
    let url = `/api/spaces/${spaceId}/presmium/outputs/${job.id}/`, revision = '', main: string | undefined
    let files = output.map(file => ({ path: `${file.index}/${encodeURIComponent(basename(file.path))}`, size: file.bytes, type: mediaTypes[extname(file.path)] ?? 'application/octet-stream' }))
    if (state === 'done') {
      if (job.kind === 'compile' && ['web', 'slides'].includes(job.input.form) && deps.content) {
        const result = await deps.content.jobOutput(member.userId, spaceId, document, job.id)
        url = result.url; revision = result.revision
        files = output.map(file => ({ path: file.path, size: file.bytes, type: mediaTypes[extname(file.path)] ?? 'application/octet-stream' }))
        main = `${job.input.form}/index.html`
      } else {
        revision = await metadataRevision(spaceId, job, source)
        main = files.find(file => file.type === 'application/pdf' || file.type === 'application/x-ipynb+json')?.path ?? files[0]?.path
      }
    }
    const log = state === 'failed' && job.log ? job.log.slice(-32_768).split(/\r?\n/).filter(Boolean).slice(-80) : []
    return { id: job.id, sequence: sequenceOf(job), document, target: targetOf(job), kind: job.kind === 'export' ? 'export' : 'render', state, canCancel: job.user_id === member.userId || member.role === 'owner', revision, source, createdAt: job.created_at.toISOString(), ...job.started_at ? { startedAt: job.started_at.toISOString() } : {}, ...job.finished_at ? { finishedAt: job.finished_at.toISOString() } : {}, url, files, ...main ? { main } : {}, ...job.error_code && state === 'failed' ? { error: job.error_code } : {}, warnings: [], log }
  }
  app.get(`${base}/jobs`, async c => {
    const { user, member, spaceId, document } = await identity(c)
    const writable = member.role !== 'reader'
    const jobs = (await rows(spaceId, document)).filter(job => writable || job.input.audience !== 'student')
    return c.json({ targets: writable ? [...targets, studentTarget] : targets, jobs: await Promise.all(jobs.map(job => present(member, spaceId, document, job))) })
  })
  app.post(`${base}/jobs`, async c => {
    const { user, member, spaceId, document } = await identity(c, true), body: unknown = await c.req.json()
    if (!isRecord(body) || typeof body.target !== 'string' || !isRecord(body.source) || typeof body.source.version !== 'string' || typeof body.source.fingerprint !== 'string') throw new CloudError(400, 'job-source-required')
    const job = await admission().prepareJob(user.id, spaceId, document, body.target, { version: body.source.version, fingerprint: body.source.fingerprint })
    return c.json(await present(member, spaceId, document, await row(spaceId, document, job.id)))
  })
  app.post(`${base}/jobs/cancel`, async c => {
    const { user, member, spaceId, document } = await identity(c, true), body = await c.req.json()
    const job = await row(spaceId, document, requireId(body.id))
    await admission().cancelJob(user.id, spaceId, job.id)
    return c.json(await present(member, spaceId, document, await row(spaceId, document, job.id)))
  })
  app.get(`${base}/jobs/events`, async c => {
    const context = await identity(c), controller = new AbortController(); streams.add(controller)
    c.header('X-Accel-Buffering', 'no')
    return streamSSE(c, async stream => {
      stream.onAbort(() => controller.abort())
      const seen = new Map<string, number>()
      try {
        await stream.writeSSE({ event: 'open', data: '{}' })
        while (!stream.aborted && !controller.signal.aborted) {
          const user = await deps.current(new Request(c.req.raw.url, { headers: c.req.raw.headers, signal: controller.signal }))
          const [member] = await Promise.all([deps.spaces.authorize(user.id, context.spaceId, 'read'), deps.documents.read(user.id, context.spaceId, context.document)])
          const writable = member.role !== 'reader'
          for (const job of await rows(context.spaceId, context.document)) {
            if (!writable && job.input.audience === 'student') continue
            const sequence = sequenceOf(job)
            if (seen.get(job.id) === sequence) continue
            await stream.writeSSE({ event: 'job', id: `${job.id}:${sequence}`, data: JSON.stringify(await present(member, context.spaceId, context.document, job)) })
            seen.set(job.id, sequence)
          }
          await stream.sleep(2000)
        }
      } catch { /* Revocation and disconnect stop delivery before another output is disclosed. */ }
      finally { controller.abort(); streams.delete(controller) }
    })
  })
  app.get('/api/spaces/:sid/presmium/outputs/:id/:index/:filename', async c => {
    const user = await deps.current(c.req.raw), spaceId = requireId(c.req.param('sid'))
    const job = await admission().outputs(user.id, spaceId, requireId(c.req.param('id')))
    const index = requireInteger(Number(c.req.param('index')), 'runtime-output-not-found', 0, 10_000), file = job.output?.[index]
    if (job.state !== 'succeeded' || !file?.key || file.path.startsWith('_presmium/') || !deps.storage) throw new CloudError(404, 'runtime-output-not-found')
    const type = extname(file.path) === '.pdf' ? 'application/pdf' : 'application/octet-stream', object = await deps.storage.get(spaceId, file.key)
    const filename = encodeURIComponent(basename(file.path)).replace(/['()*]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)
    return new Response(object.body, { headers: { 'Content-Type': type, 'Content-Disposition': `${type === 'application/pdf' && !new URL(c.req.url).searchParams.has('download') ? 'inline' : 'attachment'}; filename*=UTF-8''${filename}`, 'Content-Length': String(object.bytes), 'Cache-Control': 'private, no-store', 'Content-Security-Policy': "sandbox; default-src 'none'", 'X-Content-Type-Options': 'nosniff' } })
  })
  app.post(`${base}/build`, async c => {
    const { user, member, spaceId, document } = await identity(c, true), body = await c.req.json().catch(() => ({}))
    if (body.to !== undefined && (!Array.isArray(body.to) || body.to.some((target: unknown) => typeof target !== 'string' || !targets.some(value => value.id === target)))) throw new CloudError(400, 'output-unavailable')
    const source = await deps.documents.read(user.id, spaceId, document), outputs = []
    for (const target of body.to ?? ['web']) {
      const job = await admission().prepareJob(user.id, spaceId, document, target, source)
      const end = Date.now() + 110_000
      let current = job
      while (!['succeeded', 'failed', 'cancelled'].includes(current.state) && Date.now() < end) {
        await new Promise(resolve => setTimeout(resolve, 750)); current = await admission().readJob(user.id, spaceId, job.id)
      }
      if (current.state !== 'succeeded') throw new CloudError(current.state === 'failed' ? 422 : 503, current.state === 'failed' ? 'preview-build-failed' : 'preview-preparing', { retryAfterMs: 1000 })
      const result = await present(member, spaceId, document, await row(spaceId, document, job.id))
      outputs.push({ renderer: target, outDir: `${result.url}${result.main ?? ''}` })
    }
    return c.json({ outputs, findings: [] })
  })
  app.all(`${base}/check`, async c => {
    const { user, member, spaceId, document } = await identity(c, c.req.method !== 'GET')
    if (!deps.content) throw new CloudError(503, 'cloud-compilation-unavailable')
    return c.json({ findings: (await deps.content.ir(user.id, spaceId, document)).diagnostics })
  })
  return { close() { for (const controller of streams) controller.abort(); streams.clear() } }
}
