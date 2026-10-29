import { createHash, randomUUID } from 'node:crypto'
import { CloudError, requireId, requireText } from '../domain/errors.ts'
import { stableJson } from '../domain/json.ts'
import type { Database } from './database.ts'
import { DockerEngine } from './docker.ts'
import { containerConfiguration, runtimeCost, runtimeLabels, runtimeProfile, runtimeProfileDigest, validateRuntimeProfiles } from './environments.ts'
import type { Environments, RuntimeBilling, RuntimeContext, RuntimeOptions, RuntimeProfile } from './environments.ts'
import { readRuntimeArchive, runtimeArchive, runtimePath } from './runtime-archive.ts'

export interface RuntimeInputFile { path: string, url: string, sha256: string, bytes: number }
export interface RuntimeJobInput {
  admissionId?: string
  documentId: string
  sourceVersion: string
  /** Project-relative entry file. Only a canonical lecture.json entry is accepted. */
  entry: string
  files: RuntimeInputFile[]
  form: 'web' | 'slides' | 'notebook' | 'lecture'
  /** Platform-reserved base path rewritten only by the authorized content service. */
  contentBase: string
  audience?: 'student'
  format?: 'pdf' | 'png' | 'pptx'
}
export interface RuntimeOutput { path: string, sha256: string, bytes: number, key?: string }
export interface RuntimeJobView {
  id: string, workspaceId: string, userId: string, kind: 'compile' | 'export', state: RuntimeJobRow['state'],
  documentId: string, audience: 'author' | 'student', format: 'pdf' | 'png' | 'pptx' | null,
  profileId: string, sourceVersion: string, createdAt: string, startedAt: string | null, finishedAt: string | null,
  errorCode: string | null, output: RuntimeOutput[] | null,
}
export interface RuntimeRunnerOptions extends RuntimeOptions {
  /** Operator-configured object storage origins. URLs are minted by the cloud application, never tenant supplied. */
  inputOrigins: string[]
  uploadOutput(request: { jobId: string, workspaceId: string, path: string, bytes: Buffer, sha256: string }): Promise<{ key?: string }>
  refreshInput?(request: { jobId: string, input: RuntimeJobInput, profileDigest: string }): Promise<RuntimeJobInput>
}
interface RuntimeJobRow {
  id: string, workspace_id: string, user_id: string, billing_account_id: string, profile_id: string, operation_id: string,
  input_digest: string, input: RuntimeJobInput, kind: 'compile' | 'export',
  state: 'queued' | 'starting' | 'running' | 'publishing' | 'succeeded' | 'failed' | 'cancelled',
  cancel_requested: boolean, reservation_id: string, generation: number, container_id: string | null,
  started_at: Date | null, finished_at: Date | null, created_at: Date, error_code: string | null, settled: boolean,
  output: RuntimeOutput[] | null,
  profile_snapshot: RuntimeProfile | null,
}

const digest = (value: unknown) => createHash('sha256').update(stableJson(value)).digest('hex')
const terminal = (state: RuntimeJobRow['state']) => ['succeeded', 'failed', 'cancelled'].includes(state)
const jobView = (row: RuntimeJobRow): RuntimeJobView => ({ id: row.id, workspaceId: row.workspace_id, userId: row.user_id, kind: row.kind, state: row.state, documentId: row.input.documentId, audience: row.input.audience ?? 'author', format: row.input.format ?? null, profileId: row.profile_id, sourceVersion: row.input.sourceVersion, createdAt: row.created_at.toISOString(), startedAt: row.started_at?.toISOString() ?? null, finishedAt: row.finished_at?.toISOString() ?? null, errorCode: row.error_code, output: row.output })

export class RuntimeRunner {
  readonly owner = randomUUID()
  #closing = false
  readonly db: Database
  readonly engine: DockerEngine
  readonly profiles: readonly RuntimeProfile[]
  readonly billing: RuntimeBilling
  readonly options: RuntimeRunnerOptions
  readonly environments?: Environments
  constructor(db: Database, engine: DockerEngine, profiles: readonly RuntimeProfile[], billing: RuntimeBilling, options: RuntimeRunnerOptions, environments?: Environments) {
    this.db = db; this.engine = engine; this.profiles = profiles; this.billing = billing; this.options = options; this.environments = environments
    validateRuntimeProfiles(profiles)
    for (const origin of options.inputOrigins) if (new URL(origin).origin !== origin) throw new CloudError(500, 'runtime-input-origin-invalid')
  }
  #validate(input: RuntimeJobInput, profile: RuntimeProfile) {
    requireId(input.documentId); requireId(input.sourceVersion)
    const entry = runtimePath(input.entry)
    if (entry.split('/').at(-1) !== 'lecture.json' || !['web', 'slides', 'notebook', 'lecture'].includes(input.form)
      || input.contentBase !== `/__presmium_cloud__/${input.form}/`
      || (input.audience !== undefined && input.audience !== 'student')
      || (input.format !== undefined && !['pdf', 'png', 'pptx'].includes(input.format)) || !Array.isArray(input.files)
      || !input.files.length || input.files.length > 10_000) throw new CloudError(400, 'runtime-input-invalid')
    let total = 0
    const paths = new Set<string>()
    for (const file of input.files) {
      const path = runtimePath(file.path), url = new URL(file.url)
      if (paths.has(path) || !this.options.inputOrigins.includes(url.origin) || !['https:', 'http:'].includes(url.protocol)
        || url.username || url.password || !/^[a-f0-9]{64}$/.test(file.sha256) || !Number.isSafeInteger(file.bytes) || file.bytes < 0) throw new CloudError(400, 'runtime-input-invalid')
      paths.add(path)
      total += file.bytes
    }
    if (!paths.has(entry)) throw new CloudError(400, 'runtime-entry-missing')
    if (total > (profile.maxInputBytes ?? 64 << 20)) throw new CloudError(413, 'runtime-input-limit')
  }
  /** Input comes from an immutable server-owned version manifest, not from a tenant request body. */
  async submit(context: RuntimeContext, operationId: string, kind: 'compile' | 'export', profileId: string, input: RuntimeJobInput, expectedProfileDigest: string): Promise<RuntimeJobView> {
    const operation = requireText(operationId, 'runtime-operation-invalid', 120)
    if (!/^[a-f0-9]{64}$/.test(expectedProfileDigest)) throw new CloudError(400, 'runtime-profile-digest-required')
    if (!['compile', 'export'].includes(kind) || (kind === 'export' && (!input.format || input.audience !== undefined))) throw new CloudError(400, 'runtime-kind-invalid')
    const hash = digest({ kind, profileId, expectedProfileDigest, input: { ...input, files: input.files.map(({ url: _url, ...file }) => file) } })
    return this.db.transaction(async client => {
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended('runtime.jobs:' || $1, 0))", [context.billingAccountId])
      const known = (await client.query<RuntimeJobRow>('SELECT * FROM cloud_runtime_jobs WHERE billing_account_id=$1 AND operation_id=$2', [context.billingAccountId, operation])).rows[0]
      if (known) {
        if (known.input_digest !== hash || known.user_id !== context.userId || known.workspace_id !== context.workspaceId || !known.profile_snapshot || runtimeProfileDigest(known.profile_snapshot) !== expectedProfileDigest) throw new CloudError(409, 'runtime-operation-reused')
        return jobView(known)
      }
      if (!this.options.storage) throw new CloudError(503, 'runtime-storage-unavailable')
      const profile = runtimeProfile(this.profiles, profileId, 'job')
      if (runtimeProfileDigest(profile) !== expectedProfileDigest) throw new CloudError(409, 'runtime-profile-changed')
      this.#validate(input, profile)
      const active = Number((await client.query<{ count: string }>("SELECT count(*)::text AS count FROM cloud_runtime_jobs WHERE billing_account_id=$1 AND state IN ('queued','starting','running','publishing')", [context.billingAccountId])).rows[0]!.count)
      if (active >= 2) throw new CloudError(429, 'runtime-job-limit')
      const id = randomUUID()
      const { reservationId } = await this.billing.reserve({ context, operationId: `job:${id}`, meter: 'runtime', maxAmountMinor: runtimeCost(profile, profile.maxDurationSeconds * 1000) }, client)
        const created = await client.query<RuntimeJobRow>(`INSERT INTO cloud_runtime_jobs(id,workspace_id,user_id,billing_account_id,profile_id,operation_id,input_digest,input,kind,reservation_id,profile_snapshot) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`, [id, context.workspaceId, context.userId, context.billingAccountId, profileId, operation, hash, input, kind, reservationId, JSON.stringify(profile)])
        return jobView(created.rows[0]!)
    })
  }
  async list(context: RuntimeContext): Promise<RuntimeJobView[]> {
    return (await this.db.query<RuntimeJobRow>('SELECT * FROM cloud_runtime_jobs WHERE workspace_id=$1 AND billing_account_id=$2 ORDER BY created_at DESC LIMIT 100', [context.workspaceId, context.billingAccountId])).rows.map(jobView)
  }
  async get(context: RuntimeContext, id: string): Promise<RuntimeJobView> { return jobView(await this.#owned(context, id)) }
  async #owned(context: RuntimeContext, id: string): Promise<RuntimeJobRow> {
    const row = (await this.db.query<RuntimeJobRow>('SELECT * FROM cloud_runtime_jobs WHERE id=$1 AND workspace_id=$2 AND billing_account_id=$3', [requireId(id), context.workspaceId, context.billingAccountId])).rows[0]
    if (!row) throw new CloudError(404, 'runtime-job-not-found')
    return row
  }
  async cancel(context: RuntimeContext, id: string): Promise<RuntimeJobView> {
    const row = await this.#owned(context, id)
    if (row.user_id !== context.userId && !(await this.db.query("SELECT 1 FROM memberships WHERE space_id=$1 AND user_id=$2 AND role='owner'", [context.workspaceId, context.userId])).rowCount) throw new CloudError(403, 'permission-denied')
    if (!terminal(row.state)) await this.db.query('UPDATE cloud_runtime_jobs SET cancel_requested=true,updated_at=now() WHERE id=$1', [id])
    return this.get(context, id)
  }
  #name(row: RuntimeJobRow) { return `pm-${this.options.instanceId}-job-${row.id}` }
  async tick(): Promise<number> {
    if (this.#closing) return 0
    await this.environments?.reconcile(this.owner)
    const claimed = await this.db.transaction(async client => {
      const rows = (await client.query<RuntimeJobRow>(`SELECT * FROM cloud_runtime_jobs WHERE (state IN ('queued','starting','running','publishing') OR NOT settled) AND (lease_until IS NULL OR lease_until<now()) ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 2`)).rows
      for (const row of rows) await client.query(`UPDATE cloud_runtime_jobs SET lease_owner=$2,lease_until=now()+interval '90 seconds',state=CASE WHEN state='queued' THEN 'starting' ELSE state END WHERE id=$1`, [row.id, this.owner])
      return rows
    })
    await Promise.allSettled(claimed.map(async row => {
      const heartbeat = setInterval(() => { void this.db.query(`UPDATE cloud_runtime_jobs SET lease_until=now()+interval '90 seconds' WHERE id=$1 AND lease_owner=$2`, [row.id, this.owner]).catch(() => {}) }, 20_000)
      heartbeat.unref()
      try { await this.#one(row) }
      catch (error) {
        if (error instanceof CloudError && ([400, 413, 422].includes(error.status) || ['runtime-input-expired', 'runtime-input-unauthorized', 'history-plan-required', 'permission-denied', 'space-not-found', 'runtime-input-manifest-changed'].includes(error.code))) {
          const current = await this.#current(row.id)
          if (current) {
            const inspected = await this.engine.inspect(this.#name(current))
            if (inspected?.State.Running) await this.engine.stop(inspected.Id)
            const stopped = inspected ? await this.engine.inspect(inspected.Id) : undefined
            if (!stopped?.State.Running) await this.#terminal(current, 'failed', error.code, stopped)
          }
        }
        await this.db.query(`UPDATE cloud_runtime_jobs SET error_code=$3,updated_at=now() WHERE id=$1 AND lease_owner=$2`, [row.id, this.owner, error instanceof CloudError ? error.code : 'runtime-job-reconciliation-failed'])
      } finally {
        clearInterval(heartbeat)
        await this.db.query(`UPDATE cloud_runtime_jobs SET lease_owner=NULL,lease_until=now()+interval '5 seconds' WHERE id=$1 AND lease_owner=$2`, [row.id, this.owner])
      }
    }))
    return claimed.length
  }
  async #current(id: string): Promise<RuntimeJobRow | undefined> { return (await this.db.query<RuntimeJobRow>('SELECT * FROM cloud_runtime_jobs WHERE id=$1 AND lease_owner=$2 AND lease_until>now()', [id, this.owner])).rows[0] }
  async #one(original: RuntimeJobRow): Promise<void> {
    let row = await this.#current(original.id)
    if (!row) return
    const profile = row.profile_snapshot ?? runtimeProfile(this.profiles, row.profile_id, 'job'), name = this.#name(row)
    let inspected = await this.engine.inspect(name)
    if (inspected && Object.entries(runtimeLabels(this.options.instanceId, 'job', row.id)).some(([key, value]) => inspected!.Config.Labels?.[key] !== value)) throw new CloudError(409, 'runtime-container-ownership-mismatch')
    if (terminal(row.state)) { await this.#settle(row, profile); return }
    const member = (await this.db.query<{ role: string }>('SELECT role FROM memberships WHERE space_id=$1 AND user_id=$2', [row.workspace_id, row.user_id])).rows[0]
    const revoked = !member || !(row.input.audience === 'student' ? ['owner', 'editor'] : ['owner', 'editor', 'reader']).includes(member.role)
    if (row.cancel_requested || revoked || (row.started_at && Date.now() - row.started_at.getTime() >= profile.maxDurationSeconds * 1000)) {
      if (inspected?.State.Running) await this.engine.stop(inspected.Id)
      inspected = await this.engine.inspect(name)
      if (inspected?.State.Running) throw new CloudError(502, 'runtime-container-stop-failed')
      await this.#terminal(row, row.cancel_requested || revoked ? 'cancelled' : 'failed', row.cancel_requested || revoked ? null : 'runtime-timeout', inspected)
      return
    }
    if (!inspected) {
      if (row.state !== 'starting') { await this.#terminal(row, 'failed', 'runtime-container-lost'); return }
      this.#validate(row.input, profile)
      const labels = runtimeLabels(this.options.instanceId, 'job', row.id), volume = `pm-${this.options.instanceId}-job-${row.id}`
      if (!this.options.storage) throw new CloudError(503, 'runtime-storage-unavailable')
      const { hostPath } = await this.options.storage.acquire({ kind: 'job', id: row.id, bytes: profile.diskBytes })
      if (!hostPath.startsWith('/') || hostPath === '/' || /[\r\n\0]/.test(hostPath)) throw new CloudError(503, 'runtime-storage-invalid')
      await this.engine.volume(volume, labels, { type: 'none', o: 'bind', device: hostPath })
      const config = await containerConfiguration(profile, labels, profile.network ?? 'none')
      config.WorkingDir = '/work'
      config.Cmd = ['node', '/opt/presmium-runtime/run.mjs']
      config.Env = [`PRESMIUM_JOB_KIND=${row.kind}`, `PRESMIUM_JOB_FORM=${row.input.form}`, `PRESMIUM_JOB_CONTENT_BASE=${row.input.contentBase}`, `PRESMIUM_JOB_AUDIENCE=${row.input.audience ?? ''}`, `PRESMIUM_JOB_ENTRY=${row.input.entry}`, `PRESMIUM_JOB_FORMAT=${row.input.format ?? ''}`, `PRESMIUM_JOB_TIMEOUT_SECONDS=${profile.maxDurationSeconds}`, 'PRESMIUM_MAX_THREADS=1', 'HOME=/tmp/home', 'XDG_CACHE_HOME=/tmp/cache', 'PLAYWRIGHT_BROWSERS_PATH=/opt/playwright']
      config.HostConfig.Mounts.push({ Type: 'volume', Source: volume, Target: '/work' })
      await this.engine.create(name, config)
      inspected = await this.engine.inspect(name)
    }
    if (!inspected) throw new CloudError(502, 'runtime-container-create-failed')
    if (row.state === 'starting' && !row.started_at) {
      if (!inspected.State.Running && inspected.State.StartedAt.startsWith('0001-')) {
        if (row.input.admissionId) {
          if (!this.options.refreshInput) throw new CloudError(503, 'runtime-input-refresh-unavailable')
          const refreshed = await this.options.refreshInput({ jobId: row.id, input: row.input, profileDigest: runtimeProfileDigest(profile) })
          const identity = (value: RuntimeJobInput) => digest({ ...value, files: value.files.map(({ url: _url, ...file }) => file) })
          if (identity(refreshed) !== identity(row.input)) throw new CloudError(409, 'runtime-input-manifest-changed')
          this.#validate(refreshed, profile)
          row.input = refreshed
        }
        const files: Array<{ path: string, bytes: Buffer }> = []
        const materializeSignal = AbortSignal.timeout(Math.min(60_000, profile.maxDurationSeconds * 1000))
        for (const file of row.input.files) {
          const response = await fetch(file.url, { signal: AbortSignal.any([materializeSignal, AbortSignal.timeout(30_000)]), redirect: 'error' })
          if (response.status >= 400 && response.status < 500 && response.status !== 429) {
            await response.body?.cancel()
            throw new CloudError(422, 'runtime-input-unavailable')
          }
          if (!response.ok || !response.body) throw new CloudError(502, 'runtime-input-download-failed')
          const reader = response.body.getReader(), chunks: Uint8Array[] = []
          let length = 0
          while (true) {
            const next = await reader.read()
            if (next.done) break
            length += next.value.length
            if (length > file.bytes) { await reader.cancel(); throw new CloudError(413, 'runtime-input-size-mismatch') }
            chunks.push(next.value)
          }
          const bytes = Buffer.concat(chunks)
          if (length !== file.bytes || createHash('sha256').update(bytes).digest('hex') !== file.sha256) throw new CloudError(422, 'runtime-input-integrity-failed')
          files.push({ path: `input/${runtimePath(file.path)}`, bytes })
        }
        await this.engine.putArchive(inspected.Id, '/work', runtimeArchive(files, (profile.maxInputBytes ?? 64 << 20) + row.input.files.length * 1024 + 1024))
        row = await this.#current(row.id)
        if (!row) return
        if (row.cancel_requested) { await this.#terminal(row, 'cancelled', null, inspected); return }
        await this.engine.start(inspected.Id)
      }
      inspected = await this.engine.inspect(name)
      if (!inspected || inspected.State.StartedAt.startsWith('0001-')) throw new CloudError(502, 'runtime-container-start-failed')
      await this.db.query(`UPDATE cloud_runtime_jobs SET container_id=$3,started_at=$4,state='running',error_code=NULL,updated_at=now() WHERE id=$1 AND lease_owner=$2`, [row.id, this.owner, inspected.Id, new Date(inspected.State.StartedAt)])
      return
    }
    if (inspected.State.Running) return
    if (inspected.State.ExitCode !== 0) { await this.#terminal(row, 'failed', inspected.State.OOMKilled ? 'runtime-memory-limit' : 'runtime-process-failed', inspected); return }
    await this.db.query(`UPDATE cloud_runtime_jobs SET state='publishing',updated_at=now() WHERE id=$1 AND lease_owner=$2`, [row.id, this.owner])
    const archive = await this.engine.archive(inspected.Id, '/work/output/.', (profile.maxOutputBytes ?? 128 << 20) + (8 << 20))
    const files = readRuntimeArchive(archive, (profile.maxOutputBytes ?? 128 << 20) + (8 << 20))
    if (files.reduce((bytes, file) => bytes + file.bytes.length, 0) > (profile.maxOutputBytes ?? 128 << 20)) throw new CloudError(413, 'runtime-output-limit')
    const output: RuntimeOutput[] = []
    for (const file of files) {
      const path = file.path.replace(/^output\//, '')
      if (!path || path === 'output') continue
      const sha256 = createHash('sha256').update(file.bytes).digest('hex')
      const stored = await this.options.uploadOutput({ jobId: row.id, workspaceId: row.workspace_id, path, bytes: file.bytes, sha256 })
      output.push({ path, sha256, bytes: file.bytes.length, ...stored.key ? { key: stored.key } : {} })
    }
    if (!output.length) throw new CloudError(422, 'runtime-output-empty')
    row = await this.#current(row.id)
    if (!row) return
    if (row.cancel_requested) { await this.#terminal(row, 'cancelled', null, inspected); return }
    await this.db.query(`UPDATE cloud_runtime_jobs SET output=$3 WHERE id=$1 AND lease_owner=$2`, [row.id, this.owner, JSON.stringify(output)])
    await this.#terminal(row, 'succeeded', null, inspected)
  }
  async #terminal(row: RuntimeJobRow, state: 'succeeded' | 'failed' | 'cancelled', errorCode: string | null, inspected?: Awaited<ReturnType<DockerEngine['inspect']>>): Promise<void> {
    if (inspected?.State.Running) throw new CloudError(409, 'runtime-process-still-running')
    const finished = inspected && !inspected.State.FinishedAt.startsWith('0001-') ? new Date(inspected.State.FinishedAt) : new Date()
    const started = inspected && !inspected.State.StartedAt.startsWith('0001-') ? new Date(inspected.State.StartedAt) : null
    const logs = inspected ? await this.engine.logs(inspected.Id).catch(() => '') : ''
    await this.db.query(`UPDATE cloud_runtime_jobs SET state=$3,error_code=$4,finished_at=coalesce(finished_at,$5),started_at=coalesce(started_at,$7),log=$6,updated_at=now() WHERE id=$1 AND lease_owner=$2 AND lease_until>now()`, [row.id, this.owner, state, errorCode, finished, logs, started])
    const current = await this.#current(row.id)
    if (current) await this.#settle(current, row.profile_snapshot ?? runtimeProfile(this.profiles, row.profile_id, 'job'))
  }
  async #settle(row: RuntimeJobRow, profile: RuntimeProfile): Promise<void> {
    if (row.settled) return
    if (!row.finished_at) throw new CloudError(409, 'runtime-stop-time-unavailable')
    if (row.started_at) await this.billing.settle({ reservationId: row.reservation_id, operationId: `job:${row.id}`, actualAmountMinor: runtimeCost(profile, Math.min(profile.maxDurationSeconds * 1000, Math.max(0, row.finished_at.getTime() - row.started_at.getTime()))) })
    else await this.billing.release({ reservationId: row.reservation_id, operationId: `job:${row.id}` })
    await this.engine.remove(this.#name(row))
    await this.engine.removeVolume(`pm-${this.options.instanceId}-job-${row.id}`)
    if (!this.options.storage) throw new CloudError(503, 'runtime-storage-unavailable')
    await this.options.storage.release({ kind: 'job', id: row.id })
    await this.db.query(`UPDATE cloud_runtime_jobs SET settled=true WHERE id=$1 AND lease_owner=$2`, [row.id, this.owner])
  }
  async run(signal: AbortSignal): Promise<void> {
    while (!signal.aborted && !this.#closing) {
      await this.tick()
      await new Promise<void>(resolve => {
        const done = () => { clearTimeout(timer); signal.removeEventListener('abort', done); resolve() }
        const timer = setTimeout(done, 2000)
        signal.addEventListener('abort', done, { once: true })
        if (signal.aborted) done()
      })
    }
  }
  close(): void { this.#closing = true }
}

export function createRuntimeRunner(db: Database, engine: DockerEngine, profiles: readonly RuntimeProfile[], billing: RuntimeBilling, options: RuntimeRunnerOptions, environments?: Environments): RuntimeRunner {
  return new RuntimeRunner(db, engine, profiles, billing, options, environments)
}
