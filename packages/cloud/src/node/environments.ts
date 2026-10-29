import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto'
import type { PoolClient } from 'pg'
import { CloudError, requireId, requireText } from '../domain/errors.ts'
import { stableJson } from '../domain/json.ts'
import { planOf } from '../domain/plans.ts'
import type { Database } from './database.ts'
import { DockerEngine } from './docker.ts'
import type { ContainerConfiguration, ContainerInspection } from './docker.ts'
import { runtimeSeccompSecurityOpt } from './runtime-seccomp.ts'
import { assertStorageCapacity, lockStorageAccount } from './runtime-storage-budget.ts'

export interface RuntimeContext { workspaceId: string, userId: string, billingAccountId: string }
export interface RuntimeBilling {
  reserve(request: { context: RuntimeContext, operationId: string, meter: 'runtime', maxAmountMinor: number }, transaction: PoolClient): Promise<{ reservationId: string }>
  settle(request: { reservationId: string, operationId: string, actualAmountMinor: number }): Promise<void>
  release(request: { reservationId: string, operationId: string }): Promise<void>
}
export interface RuntimeProfile {
  id: string
  kind: 'jupyter' | 'job'
  image: string
  cpu: number
  memoryBytes: number
  diskBytes: number
  pidsLimit: number
  maxDurationSeconds: number
  pricePerMinuteMinor: number
  idleSeconds?: number
  runtime?: string
  user?: string
  /** Only job profiles may have an operator-selected network. Jupyter gets a private network. */
  network?: string
  maxInputBytes?: number
  maxOutputBytes?: number
}
export interface RuntimeOptions {
  instanceId: string
  credentialKey: string
  runnerContainerId?: string
  jupyterOrigin?: string
  storage?: RuntimeStorage
}
/** Trusted host storage adapter. Paths are allocated by the operator's quota pool. */
export interface RuntimeStorage {
  acquire(request: { kind: 'job' | 'environment', id: string, bytes: number }): Promise<{ hostPath: string }>
  release(request: { kind: 'job' | 'environment', id: string }): Promise<void>
}
export interface EnvironmentView {
  id: string
  workspaceId: string
  userId: string
  profileId: string
  name: string
  state: 'stopped' | 'starting' | 'running' | 'stopping' | 'failed'
  generation: number
  startedAt: string | null
  runDeadline: string | null
  lastActivityAt: string
  errorCode: string | null
}
export interface EnvironmentRow {
  id: string, workspace_id: string, user_id: string, billing_account_id: string, profile_id: string, name: string,
  desired_state: 'running' | 'stopped', state: EnvironmentView['state'], generation: number, container_id: string | null,
  credential: string, reservation_id: string | null, start_operation_id: string | null,
  started_at: Date | null, stopped_at: Date | null, last_activity_at: Date, run_deadline: Date | null,
  error_code: string | null,
  profile_snapshot: RuntimeProfile | null,
  destroyed_at: Date | null,
}

const labelRoot = 'io.presmium.cloud'
const date = (value: Date | null) => value?.toISOString() ?? null
export const runtimeLabels = (instanceId: string, kind: string, id: string) => ({ [`${labelRoot}.instance`]: instanceId, [`${labelRoot}.kind`]: kind, [`${labelRoot}.id`]: id })
/** Ordinary document and runtime operations are free; AI pricing is outside this runtime. */
export const runtimeCost = (_profile: RuntimeProfile, _milliseconds: number): number => 0
export const runtimeProfileDigest = (profile: RuntimeProfile) => createHash('sha256').update(stableJson(profile)).digest('hex')

export function runtimeProfile(profiles: readonly RuntimeProfile[], id: string, kind?: RuntimeProfile['kind']): RuntimeProfile {
  const profile = profiles.find(value => value.id === id && (!kind || value.kind === kind))
  if (!profile) throw new CloudError(400, 'runtime-profile-unavailable')
  return profile
}

export function validateRuntimeProfiles(profiles: readonly RuntimeProfile[]): void {
  const ids = new Set<string>()
  for (const profile of profiles) {
    if (!/^[a-z][a-z0-9-]{0,63}$/.test(profile.id) || ids.has(profile.id)
      || !profile.image || profile.image.includes('\n') || !['jupyter', 'job'].includes(profile.kind)
      || !Number.isFinite(profile.cpu) || profile.cpu <= 0 || profile.cpu > 128
      || !Number.isSafeInteger(profile.memoryBytes) || profile.memoryBytes < 64 * 1024 * 1024
      || !Number.isSafeInteger(profile.diskBytes) || profile.diskBytes < 1
      || !Number.isSafeInteger(profile.pidsLimit) || profile.pidsLimit < 16
      || !Number.isSafeInteger(profile.maxDurationSeconds) || profile.maxDurationSeconds < 1 || profile.maxDurationSeconds > 86_400
      || profile.pricePerMinuteMinor !== 0
      || !Number.isSafeInteger(runtimeCost(profile, profile.maxDurationSeconds * 1000))) throw new CloudError(500, 'runtime-profile-invalid')
    if (profile.user && (!/^\d+:\d+$/.test(profile.user) || profile.user.split(':')[0] === '0')) throw new CloudError(500, 'runtime-profile-user-invalid')
    if (profile.idleSeconds !== undefined && (!Number.isSafeInteger(profile.idleSeconds) || profile.idleSeconds < 30)) throw new CloudError(500, 'runtime-profile-idle-invalid')
    if ([profile.maxInputBytes, profile.maxOutputBytes].some(bytes => bytes !== undefined && (!Number.isSafeInteger(bytes) || bytes < 1024 || bytes > 512 * 1024 * 1024))) throw new CloudError(500, 'runtime-profile-file-limit-invalid')
    ids.add(profile.id)
  }
}

export async function containerConfiguration(profile: RuntimeProfile, labels: Record<string, string>, network: string): Promise<ContainerConfiguration> {
  return {
    Image: profile.image, User: profile.user ?? (profile.kind === 'jupyter' ? '1000:100' : '1000:1000'), Cmd: [], Env: [], Labels: { ...labels, [`${labelRoot}.max-duration-seconds`]: String(profile.maxDurationSeconds) },
    HostConfig: {
      NetworkMode: network, ReadonlyRootfs: true, CapDrop: ['ALL'], SecurityOpt: ['no-new-privileges:true', await runtimeSeccompSecurityOpt()],
      NanoCpus: Math.floor(profile.cpu * 1e9), Memory: profile.memoryBytes, MemorySwap: profile.memoryBytes,
      PidsLimit: profile.pidsLimit, Init: true, ...profile.runtime ? { Runtime: profile.runtime } : {},
      Mounts: [], Tmpfs: { '/tmp': 'rw,nosuid,nodev,size=134217728,mode=1777', '/run': 'rw,nosuid,nodev,size=16777216,mode=1777' },
      LogConfig: { Type: 'local', Config: { 'max-size': '1m', 'max-file': '2' } },
    },
  }
}

function view(row: EnvironmentRow): EnvironmentView {
  return { id: row.id, workspaceId: row.workspace_id, userId: row.user_id, profileId: row.profile_id, name: row.name, state: row.state, generation: row.generation, startedAt: date(row.started_at), runDeadline: date(row.run_deadline), lastActivityAt: row.last_activity_at.toISOString(), errorCode: row.error_code }
}

/** Stateful kernels are private to one member. Caller authorization is supplied by the cloud application. */
export class Environments {
  readonly #key: Buffer
  readonly db: Database
  readonly engine: DockerEngine
  readonly profiles: readonly RuntimeProfile[]
  readonly billing: RuntimeBilling
  readonly options: RuntimeOptions
  constructor(db: Database, engine: DockerEngine, profiles: readonly RuntimeProfile[], billing: RuntimeBilling, options: RuntimeOptions) {
    this.db = db; this.engine = engine; this.profiles = profiles; this.billing = billing; this.options = options
    validateRuntimeProfiles(profiles)
    if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(options.instanceId) || options.credentialKey.length < 32) throw new CloudError(500, 'runtime-configuration-invalid')
    if (options.jupyterOrigin && new URL(options.jupyterOrigin).origin !== options.jupyterOrigin) throw new CloudError(500, 'runtime-origin-invalid')
    this.#key = createHash('sha256').update(options.credentialKey).digest()
  }
  #seal(token: string): string {
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', this.#key, iv)
    return Buffer.concat([iv, cipher.update(token, 'utf8'), cipher.final(), cipher.getAuthTag()]).toString('base64url')
  }
  #open(sealed: string): string {
    const bytes = Buffer.from(sealed, 'base64url'), decipher = createDecipheriv('aes-256-gcm', this.#key, bytes.subarray(0, 12))
    decipher.setAuthTag(bytes.subarray(-16))
    return Buffer.concat([decipher.update(bytes.subarray(12, -16)), decipher.final()]).toString('utf8')
  }
  #scope(context: RuntimeContext, id: string) { return [requireId(id), requireId(context.workspaceId), requireId(context.userId), requireId(context.billingAccountId)] }
  async #owned(context: RuntimeContext, id: string, sql: Pick<PoolClient, 'query'> = this.db, lock = false, allowSpaceOwner = false): Promise<EnvironmentRow> {
    const owner = allowSpaceOwner ? " OR EXISTS(SELECT 1 FROM memberships WHERE space_id=$2 AND user_id=$3 AND role='owner')" : ''
    const found = await sql.query<EnvironmentRow>(`SELECT * FROM cloud_environments WHERE id=$1 AND workspace_id=$2 AND (user_id=$3${owner}) AND billing_account_id=$4 AND destroyed_at IS NULL${lock ? ' FOR UPDATE' : ''}`, this.#scope(context, id))
    if (!found.rows[0]) throw new CloudError(404, 'runtime-environment-not-found')
    return found.rows[0]
  }
  async list(context: RuntimeContext): Promise<EnvironmentView[]> {
    const found = await this.db.query<EnvironmentRow>("SELECT * FROM cloud_environments WHERE workspace_id=$1 AND (user_id=$2 OR EXISTS(SELECT 1 FROM memberships WHERE space_id=$1 AND user_id=$2 AND role='owner')) AND billing_account_id=$3 AND destroyed_at IS NULL ORDER BY created_at", [context.workspaceId, context.userId, context.billingAccountId])
    return found.rows.map(view)
  }
  async get(context: RuntimeContext, id: string): Promise<EnvironmentView> { return view(await this.#owned(context, id)) }
  async create(context: RuntimeContext, profileId: string, name: string): Promise<EnvironmentView> {
    const profile = runtimeProfile(this.profiles, profileId, 'jupyter')
    const id = randomUUID()
    return this.db.transaction(async sql => {
      const account = await lockStorageAccount(sql, context.billingAccountId)
      await assertStorageCapacity(sql, context.billingAccountId, account.plan, profile.diskBytes)
      const result = await sql.query<EnvironmentRow>(`INSERT INTO cloud_environments(id,workspace_id,user_id,billing_account_id,profile_id,name,credential,profile_snapshot) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [...this.#scope(context, id), profileId, requireText(name, 'runtime-name-invalid', 100), this.#seal(randomBytes(32).toString('base64url')), JSON.stringify(profile)])
      return view(result.rows[0]!)
    })
  }
  async start(context: RuntimeContext, id: string, operationId: string, expectedProfileDigest: string, expectedGeneration?: number): Promise<EnvironmentView> {
    const operation = requireText(operationId, 'runtime-operation-invalid', 120)
    if (!/^[a-f0-9]{64}$/.test(expectedProfileDigest)) throw new CloudError(400, 'runtime-profile-digest-required')
    return this.db.transaction(async client => {
        const account = await lockStorageAccount(client, context.billingAccountId)
        const row = await this.#owned(context, id, client, true)
        const prior = (await client.query<{ profile_digest: string, result: EnvironmentView }>('SELECT profile_digest,result FROM cloud_environment_starts WHERE environment_id=$1 AND operation_id=$2', [id, operation])).rows[0]
        if (prior) {
          if (prior.profile_digest !== expectedProfileDigest) throw new CloudError(409, 'runtime-operation-reused')
          return prior.result
        }
        if (!this.options.storage) throw new CloudError(503, 'runtime-storage-unavailable')
        if (expectedGeneration !== undefined && (!Number.isSafeInteger(expectedGeneration) || expectedGeneration !== row.generation)) throw new CloudError(409, 'runtime-generation-changed')
        if (row.desired_state === 'running' || row.state === 'stopping') throw new CloudError(409, 'runtime-environment-busy')
        const profile = runtimeProfile(this.profiles, row.profile_id, 'jupyter')
        if (runtimeProfileDigest(profile) !== expectedProfileDigest) throw new CloudError(409, 'runtime-profile-changed')
        if (row.profile_snapshot?.diskBytes !== undefined && row.profile_snapshot.diskBytes !== profile.diskBytes) throw new CloudError(409, 'runtime-storage-allocation-changed')
        await assertStorageCapacity(client, context.billingAccountId, account.plan)
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended('runtime.environments:' || $1, 0))", [context.billingAccountId])
        const count = Number((await client.query<{ count: string }>("SELECT count(*)::text AS count FROM cloud_environments WHERE billing_account_id=$1 AND state IN ('starting','running','stopping')", [context.billingAccountId])).rows[0]!.count)
        if (count >= planOf(account.plan).concurrentEnvironments) throw new CloudError(429, 'runtime-concurrency-limit')
        const { reservationId } = await this.billing.reserve({ context, operationId: `environment:${id}:${operation}`, meter: 'runtime', maxAmountMinor: runtimeCost(profile, profile.maxDurationSeconds * 1000) }, client)
        const updated = await client.query<EnvironmentRow>(`UPDATE cloud_environments SET desired_state='running',state='starting',generation=generation+1,container_id=NULL,reservation_id=$2,start_operation_id=$3,profile_snapshot=$4,started_at=NULL,stopped_at=NULL,run_deadline=NULL,error_code=NULL,last_activity_at=now(),updated_at=now() WHERE id=$1 RETURNING *`, [id, reservationId, operation, JSON.stringify(profile)])
        const result = view(updated.rows[0]!)
        await client.query('INSERT INTO cloud_environment_starts(environment_id,operation_id,generation,profile_digest,result) VALUES($1,$2,$3,$4,$5)', [id, operation, result.generation, expectedProfileDigest, JSON.stringify(result)])
        return result
    })
  }
  async destroyEnvironment(context: RuntimeContext, id: string): Promise<{ id: string, destroyed: true }> {
    return this.db.transaction(async sql => {
      await lockStorageAccount(sql, context.billingAccountId)
      const row = (await sql.query<EnvironmentRow>("SELECT * FROM cloud_environments WHERE id=$1 AND workspace_id=$2 AND (user_id=$3 OR EXISTS(SELECT 1 FROM memberships WHERE space_id=$2 AND user_id=$3 AND role='owner')) AND billing_account_id=$4 FOR UPDATE", this.#scope(context, id))).rows[0]
      if (!row) throw new CloudError(404, 'runtime-environment-not-found')
      if (row.destroyed_at) return { id: row.id, destroyed: true }
      if (!['stopped','failed'].includes(row.state) || row.desired_state !== 'stopped' || row.container_id || row.reservation_id
        || (await this.engine.containers(runtimeLabels(this.options.instanceId, 'environment', row.id))).length) throw new CloudError(409, 'runtime-environment-busy')
      if (!this.options.storage) throw new CloudError(503, 'runtime-storage-unavailable')
      await this.engine.removeVolume(`pm-${this.options.instanceId}-home-${row.id}`)
      await this.engine.removeNetwork(this.#networkName(row), runtimeLabels(this.options.instanceId, 'environment', row.id), this.options.runnerContainerId)
      await this.options.storage.release({ kind: 'environment', id: row.id })
      await sql.query('UPDATE cloud_environments SET destroyed_at=now(),updated_at=now() WHERE id=$1', [row.id])
      return { id: row.id, destroyed: true }
    })
  }
  async stop(context: RuntimeContext, id: string): Promise<EnvironmentView> {
    return this.db.transaction(async client => {
      const row = await this.#owned(context, id, client, true, true)
      if (row.state === 'stopped' || row.state === 'failed') return view(row)
      const result = await client.query<EnvironmentRow>(`UPDATE cloud_environments SET desired_state='stopped',state='stopping',updated_at=now() WHERE id=$1 RETURNING *`, [id])
      return view(result.rows[0]!)
    })
  }
  async revoke(workspaceId: string, userId: string): Promise<void> {
    await this.db.query(`UPDATE cloud_environments SET desired_state='stopped',state='stopping',updated_at=now() WHERE workspace_id=$1 AND user_id=$2 AND state IN ('starting','running')`, [requireId(workspaceId), requireId(userId)])
  }
  async touch(context: RuntimeContext, id: string): Promise<void> {
    await this.#owned(context, id)
    await this.db.query('UPDATE cloud_environments SET last_activity_at=now() WHERE id=$1', [id])
  }
  /** Internal broker only. Never serialize its credentials into API responses or tenant content. */
  async connection(context: RuntimeContext, id: string): Promise<{ url: string, headers: Record<string, string>, generation: number }> {
    const row = await this.#owned(context, id)
    if (row.state !== 'running' || row.desired_state !== 'running' || !row.run_deadline || row.run_deadline.getTime() <= Date.now()) throw new CloudError(409, 'runtime-environment-not-running')
    const inspected = await this.engine.inspect(this.#containerName(row))
    if (!inspected?.State.Running || !this.#managed(inspected, row)) throw new CloudError(409, 'runtime-environment-not-running')
    // A broker replacement has a new Docker endpoint even when the private kernel is unchanged.
    await this.engine.network(this.#networkName(row), runtimeLabels(this.options.instanceId, 'environment', row.id), this.options.runnerContainerId)
    const ip = inspected.NetworkSettings.Networks?.[this.#networkName(row)]?.IPAddress
    if (!ip) throw new CloudError(503, 'runtime-network-unavailable')
    return { url: `http://${ip}:8888${this.#basePath(row)}`, headers: { Authorization: `token ${this.#open(row.credential)}` }, generation: row.generation }
  }
  #containerName(row: EnvironmentRow) { return `pm-${this.options.instanceId}-env-${row.id}-${row.generation}` }
  #networkName(row: EnvironmentRow) { return `pm-${this.options.instanceId}-env-${row.id}` }
  #basePath(row: EnvironmentRow) { return `/runtime/spaces/${row.workspace_id}/environments/${row.id}/proxy/` }
  #managed(inspected: ContainerInspection, row: EnvironmentRow): boolean {
    return Object.entries(runtimeLabels(this.options.instanceId, 'environment', row.id)).every(([key, value]) => inspected.Config.Labels?.[key] === value)
      && inspected.Config.Labels?.[`${labelRoot}.generation`] === String(row.generation)
  }
  async reconcile(owner: string, limit = 8): Promise<number> {
    const claimed = await this.db.transaction(async client => {
      const found = await client.query<EnvironmentRow>(`SELECT * FROM cloud_environments WHERE state IN ('starting','running','stopping') AND (lease_until IS NULL OR lease_until<now()) ORDER BY updated_at FOR UPDATE SKIP LOCKED LIMIT $1`, [limit])
      for (const row of found.rows) await client.query(`UPDATE cloud_environments SET lease_owner=$2,lease_until=now()+interval '90 seconds' WHERE id=$1`, [row.id, owner])
      return found.rows
    })
    await Promise.allSettled(claimed.map(async row => {
      const heartbeat = setInterval(() => {
        void this.db.query(`UPDATE cloud_environments SET lease_until=now()+interval '90 seconds' WHERE id=$1 AND lease_owner=$2`, [row.id, owner]).catch(() => {})
      }, 20_000)
      heartbeat.unref()
      try { await this.#reconcileOne(row, owner) }
      catch {
        // An unreachable Engine is not proof of a stopped container. Retain reservation for reconciliation.
        await this.db.query(`UPDATE cloud_environments SET error_code='runtime-reconciliation-failed',lease_until=now()+interval '10 seconds' WHERE id=$1 AND lease_owner=$2`, [row.id, owner])
      } finally {
        clearInterval(heartbeat)
        await this.db.query(`UPDATE cloud_environments SET lease_owner=NULL,lease_until=now()+interval '5 seconds' WHERE id=$1 AND lease_owner=$2`, [row.id, owner])
      }
    }))
    return claimed.length
  }
  async #reconcileOne(original: EnvironmentRow, owner: string): Promise<void> {
    let row = (await this.db.query<EnvironmentRow>('SELECT * FROM cloud_environments WHERE id=$1 AND lease_owner=$2', [original.id, owner])).rows[0]
    if (!row) return
    const profile = row.profile_snapshot ?? runtimeProfile(this.profiles, row.profile_id, 'jupyter')
    const member = (await this.db.query<{ role: string, can_execute: boolean, can_spend: boolean }>('SELECT role,can_execute,can_spend FROM memberships WHERE space_id=$1 AND user_id=$2', [row.workspace_id, row.user_id])).rows[0]
    if (!member || (member.role !== 'owner' && (member.role !== 'editor' || !member.can_execute))) {
      await this.db.query(`UPDATE cloud_environments SET desired_state='stopped',state='stopping' WHERE id=$1 AND lease_owner=$2`, [row.id, owner])
      row.desired_state = 'stopped'
    }
    const name = this.#containerName(row)
    let inspected = await this.engine.inspect(name)
    if (inspected && !this.#managed(inspected, row)) throw new CloudError(409, 'runtime-container-ownership-mismatch')
    if (inspected?.State.Running && row.desired_state === 'running') await this.engine.network(this.#networkName(row), runtimeLabels(this.options.instanceId, 'environment', row.id), this.options.runnerContainerId)
    if (inspected?.State.Running && Date.parse(inspected.State.StartedAt) + profile.maxDurationSeconds * 1000 <= Date.now()) {
      await this.#finish(row, inspected, owner)
      return
    }
    if (row.desired_state === 'running' && row.state === 'starting') {
      // A failed/not-ready server is terminal for this paid generation. Restarting it would reset the hard lease.
      if ((!inspected && row.started_at) || (inspected && !inspected.State.Running && !inspected.State.StartedAt.startsWith('0001-'))) {
        await this.#finish(row, inspected, owner)
        return
      }
      if (!inspected) {
        const labels = { ...runtimeLabels(this.options.instanceId, 'environment', row.id), [`${labelRoot}.generation`]: String(row.generation) }
        const volume = `pm-${this.options.instanceId}-home-${row.id}`
        if (!this.options.storage) throw new CloudError(503, 'runtime-storage-unavailable')
        const { hostPath } = await this.options.storage.acquire({ kind: 'environment', id: row.id, bytes: profile.diskBytes })
        if (!hostPath.startsWith('/') || hostPath === '/' || /[\r\n\0]/.test(hostPath)) throw new CloudError(503, 'runtime-storage-invalid')
        await this.engine.volume(volume, runtimeLabels(this.options.instanceId, 'environment', row.id), { type: 'none', o: 'bind', device: hostPath })
        await this.engine.network(this.#networkName(row), runtimeLabels(this.options.instanceId, 'environment', row.id), this.options.runnerContainerId)
        const config = await containerConfiguration(profile, labels, this.#networkName(row))
        config.WorkingDir = '/home/jovyan/work'
        config.Env = [`JUPYTER_TOKEN=${this.#open(row.credential)}`, 'DOCKER_STACKS_JUPYTER_CMD=server', 'HOME=/home/jovyan']
        config.Cmd = ['timeout', '--signal=TERM', '--kill-after=10s', `${profile.maxDurationSeconds}s`, 'start-notebook.py', '--ServerApp.ip=0.0.0.0', '--ServerApp.port=8888', '--ServerApp.open_browser=False', '--ServerApp.allow_remote_access=True', `--ServerApp.base_url=${this.#basePath(row)}`, '--ServerApp.default_url=/lab', '--ServerApp.root_dir=/home/jovyan/work', `--MappingKernelManager.cull_idle_timeout=${profile.idleSeconds ?? 1200}`, '--MappingKernelManager.cull_interval=60', '--MappingKernelManager.cull_connected=True', `--TerminalManager.cull_inactive_timeout=${profile.idleSeconds ?? 1200}`, '--TerminalManager.cull_interval=60', ...this.options.jupyterOrigin ? [`--ServerApp.allow_origin=${this.options.jupyterOrigin}`] : []]
        config.HostConfig.Mounts.push({ Type: 'volume', Source: volume, Target: '/home/jovyan/work' })
        config.HostConfig.Tmpfs['/home/jovyan/.local'] = 'rw,nosuid,nodev,size=67108864,uid=1000,gid=100,mode=0700'
        config.HostConfig.Tmpfs['/home/jovyan/.jupyter'] = 'rw,nosuid,nodev,size=16777216,uid=1000,gid=100,mode=0700'
        await this.engine.create(name, config)
        inspected = await this.engine.inspect(name)
      }
      if (!inspected) throw new CloudError(502, 'runtime-container-create-failed')
      // Re-read cancellation immediately before starting, after potentially slow image/volume operations.
      row = (await this.db.query<EnvironmentRow>('SELECT * FROM cloud_environments WHERE id=$1 AND lease_owner=$2 AND lease_until>now()', [row.id, owner])).rows[0]
      if (!row) return
      if (row.desired_state !== 'running') { await this.#finish(row, inspected, owner); return }
      if (!inspected.State.Running) await this.engine.start(inspected.Id)
      inspected = await this.engine.inspect(name)
      if (!inspected?.State.Running) throw new CloudError(502, 'runtime-container-start-failed')
      const startedAt = new Date(inspected.State.StartedAt)
      const ip = inspected.NetworkSettings.Networks?.[this.#networkName(row)]?.IPAddress
      let ready = false
      if (ip) {
        try { ready = (await fetch(`http://${ip}:8888${this.#basePath(row)}api`, { headers: { Authorization: `token ${this.#open(row.credential)}` }, signal: AbortSignal.timeout(3000), redirect: 'error' })).ok }
        catch { /* Readiness remains starting until the real server answers. */ }
      }
      await this.db.query(`UPDATE cloud_environments SET container_id=$3,state=CASE WHEN desired_state<>'running' THEN 'stopping' WHEN $6 THEN 'running' ELSE 'starting' END,started_at=$4,run_deadline=$4::timestamptz+($5*interval '1 second'),error_code=CASE WHEN $6 THEN NULL ELSE 'runtime-not-ready' END,updated_at=now() WHERE id=$1 AND lease_owner=$2`, [row.id, owner, inspected.Id, startedAt, profile.maxDurationSeconds, ready])
      return
    }
    if (row.desired_state === 'stopped' || !inspected?.State.Running || !row.run_deadline || row.run_deadline.getTime() <= Date.now()) {
      await this.#finish(row, inspected, owner)
      return
    }
    const idleSince = await this.#lastKernelActivity(row, inspected)
    if (Date.now() - Math.max(row.last_activity_at.getTime(), idleSince) >= (profile.idleSeconds ?? 1200) * 1000) await this.#finish(row, inspected, owner)
  }
  async #lastKernelActivity(row: EnvironmentRow, inspected: ContainerInspection): Promise<number> {
    const ip = inspected.NetworkSettings.Networks?.[this.#networkName(row)]?.IPAddress
    if (!ip) return Date.now()
    try {
      const response = await fetch(`http://${ip}:8888${this.#basePath(row)}api/kernels`, { headers: { Authorization: `token ${this.#open(row.credential)}` }, signal: AbortSignal.timeout(3000), redirect: 'error' })
      if (!response.ok) return Date.now()
      const kernels = await response.json() as Array<{ execution_state?: string, last_activity?: string }>
      if (!Array.isArray(kernels)) return Date.now()
      if (kernels.some(kernel => kernel.execution_state === 'busy')) return Date.now()
      return Math.max(0, ...kernels.map(kernel => Date.parse(kernel.last_activity ?? '') || 0))
    } catch { return Date.now() }
  }
  async #finish(row: EnvironmentRow, inspected: ContainerInspection | undefined, owner: string): Promise<void> {
    if (inspected?.State.Running) { await this.engine.stop(inspected.Id); inspected = await this.engine.inspect(inspected.Id) }
    if (inspected?.State.Running) throw new CloudError(502, 'runtime-container-stop-failed')
    const actualStart = row.started_at ?? (inspected && !inspected.State.StartedAt.startsWith('0001-') ? new Date(inspected.State.StartedAt) : null)
    const observedFinish = inspected && !inspected.State.FinishedAt.startsWith('0001-') ? new Date(inspected.State.FinishedAt) : new Date()
    const persisted = await this.db.query<EnvironmentRow>(`UPDATE cloud_environments SET started_at=coalesce(started_at,$4),stopped_at=coalesce(stopped_at,$5),desired_state='stopped',state='stopping',updated_at=now()
      WHERE id=$1 AND lease_owner=$2 AND lease_until>now() AND generation=$3 RETURNING *`, [row.id, owner, row.generation, actualStart, observedFinish])
    if (!persisted.rows[0]) return
    row = persisted.rows[0]
    const finished = row.stopped_at!
    if (row.reservation_id) {
      const operationId = `environment:${row.id}:${row.start_operation_id}`
      if (row.started_at) {
        const profile = row.profile_snapshot ?? runtimeProfile(this.profiles, row.profile_id)
        // Shutdown scheduling/grace beyond the admitted lease is borne by the platform.
        const chargedMs = Math.min(profile.maxDurationSeconds * 1000, Math.max(0, finished.getTime() - row.started_at.getTime()))
        await this.billing.settle({ reservationId: row.reservation_id, operationId, actualAmountMinor: runtimeCost(profile, chargedMs) })
      }
      else await this.billing.release({ reservationId: row.reservation_id, operationId })
    }
    if (inspected) await this.engine.remove(inspected.Id)
    await this.db.query(`UPDATE cloud_environments SET desired_state='stopped',state='stopped',container_id=NULL,reservation_id=NULL,error_code=NULL,updated_at=now() WHERE id=$1 AND lease_owner=$2 AND generation=$3 AND lease_until>now()`, [row.id, owner, row.generation])
  }
}

export function createEnvironments(db: Database, engine: DockerEngine, profiles: readonly RuntimeProfile[], billing: RuntimeBilling, options: RuntimeOptions): Environments {
  return new Environments(db, engine, profiles, billing, options)
}
