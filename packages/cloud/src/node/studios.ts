import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { CloudError, requireId } from '../domain/errors.ts'
import type { Database } from './database.ts'
import type { ContainerConfiguration, ContainerInspection, DockerEngine } from './docker.ts'
import { runtimeSeccompSecurityOpt } from './runtime-seccomp.ts'
import type { StudioStorage } from './runtime-storage.ts'

/** The operator's one container profile for every Studio (`deploy/cloud/studio-profile.json`). */
export interface StudioProfile {
  image: string
  cpu: number
  memoryBytes: number
  diskBytes: number
  pidsLimit: number
  /** Stopped after this long without a browser or MCP request; the files stay. */
  idleSeconds: number
  /** Hard limit of one run, enforced by the watchdog from outside the container. */
  maxDurationSeconds: number
  tmpBytes: number
  runtime?: string
}

export type StudioState = 'stopped' | 'starting' | 'running' | 'stopping' | 'failed'
export interface StudioView {
  spaceId: string
  slug: string
  state: StudioState
  generation: number
  startedAt: string | null
  lastActivityAt: string
  errorCode: string | null
}
interface StudioRow {
  space_id: string, slug: string, desired_state: 'running' | 'stopped', state: StudioState, generation: number,
  container_id: string | null, address: string | null, control_token: string, started_at: Date | null,
  last_activity_at: Date, error_code: string | null, owner_id: string, owner_name: string, owner_email: string | null,
}
/** What the console needs to reach a running Studio over its private network. */
export interface StudioConnection { slug: string, generation: number, studio: string, control: string, controlToken: string }

const label = 'io.presmium.cloud'
const date = (value: Date | null) => value?.toISOString() ?? null
const view = (row: StudioRow): StudioView => ({ spaceId: row.space_id, slug: row.slug, state: row.state, generation: row.generation, startedAt: date(row.started_at), lastActivityAt: row.last_activity_at.toISOString(), errorCode: row.error_code })
const SELECT = 'SELECT t.*, s.owner_id, u.name AS owner_name, u.email AS owner_email FROM studios t JOIN spaces s ON s.id = t.space_id JOIN users u ON u.id = s.owner_id'
export const STUDIO_PORT = 3080
export const CONTROL_PORT = 3090

export function validateStudioProfile(profile: StudioProfile): void {
  const integer = (value: number, min: number, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(value) && value >= min && value <= max
  if (!profile || typeof profile.image !== 'string' || !profile.image || /\s/.test(profile.image)
    || !Number.isFinite(profile.cpu) || profile.cpu <= 0 || profile.cpu > 64
    || !integer(profile.memoryBytes, 1 << 30) || !integer(profile.diskBytes, 256 << 20) || !integer(profile.tmpBytes, 64 << 20)
    || !integer(profile.pidsLimit, 128) || !integer(profile.idleSeconds, 60) || !integer(profile.maxDurationSeconds, 600, 99_999)) throw new CloudError(500, 'runtime-profile-invalid')
}

class Sealer {
  readonly #key: Buffer
  constructor(secret: string) {
    if (secret.length < 32) throw new CloudError(500, 'runtime-configuration-invalid')
    this.#key = createHash('sha256').update(secret).digest()
  }
  seal(value: string): string {
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', this.#key, iv)
    return Buffer.concat([iv, cipher.update(value, 'utf8'), cipher.final(), cipher.getAuthTag()]).toString('base64url')
  }
  open(sealed: string): string {
    const bytes = Buffer.from(sealed, 'base64url'), decipher = createDecipheriv('aes-256-gcm', this.#key, bytes.subarray(0, 12))
    decipher.setAuthTag(bytes.subarray(-16))
    return Buffer.concat([decipher.update(bytes.subarray(12, -16)), decipher.final()]).toString('utf8')
  }
}

/** The console's side: a Studio's desired state and the address of a running one. Docker is the runner's. */
export class Studios {
  readonly db: Database
  readonly #sealer: Sealer
  constructor(db: Database, credentialKey: string) { this.db = db; this.#sealer = new Sealer(credentialKey) }

  async #row(spaceId: string, lock = false, sql: Pick<Database, 'query'> = this.db): Promise<StudioRow> {
    await sql.query(`INSERT INTO studios (space_id, slug, control_token) VALUES ($1, $2, $3) ON CONFLICT (space_id) DO NOTHING`, [requireId(spaceId), randomBytes(16).toString('hex'), this.#sealer.seal(randomBytes(32).toString('base64url'))])
    const row = (await sql.query<StudioRow>(`${SELECT} WHERE t.space_id = $1${lock ? ' FOR UPDATE OF t' : ''}`, [spaceId])).rows[0]
    if (!row) throw new CloudError(404, 'space-not-found')
    return row
  }
  async get(spaceId: string): Promise<StudioView> { return view(await this.#row(spaceId)) }
  async bySlug(slug: string): Promise<StudioView | undefined> {
    const row = (await this.db.query<StudioRow>(`${SELECT} WHERE t.slug = $1`, [slug])).rows[0]
    return row ? view(row) : undefined
  }
  /** Idempotent: a starting or running Studio stays as it is; a stopped or failed one gets a new generation. */
  async start(spaceId: string): Promise<StudioView> {
    return this.db.transaction(async sql => {
      const row = await this.#row(spaceId, true, sql)
      if (row.desired_state === 'running' && (row.state === 'starting' || row.state === 'running')) return view(row)
      if (row.state === 'stopping') throw new CloudError(409, 'studio-stopping')
      const updated = await sql.query<StudioRow>(`UPDATE studios SET desired_state = 'running', state = 'starting', generation = generation + 1, container_id = NULL, address = NULL,
        started_at = NULL, error_code = NULL, last_activity_at = now(), updated_at = now() WHERE space_id = $1 RETURNING *`, [spaceId])
      return view({ ...row, ...updated.rows[0]! })
    })
  }
  async stop(spaceId: string): Promise<StudioView> {
    await this.db.query(`UPDATE studios SET desired_state = 'stopped', state = CASE WHEN state IN ('starting', 'running') THEN 'stopping' ELSE state END, updated_at = now() WHERE space_id = $1`, [requireId(spaceId)])
    return this.get(spaceId)
  }
  async touch(spaceId: string): Promise<void> {
    await this.db.query(`UPDATE studios SET last_activity_at = now() WHERE space_id = $1 AND last_activity_at < now() - interval '30 seconds'`, [spaceId])
  }
  /** A running Studio's private address; only the console's gateway and control client use it. */
  async connection(spaceId: string, generation?: number): Promise<StudioConnection> {
    const row = await this.#row(spaceId)
    if (row.state !== 'running' || row.desired_state !== 'running' || !row.address || generation !== undefined && row.generation !== generation) throw new CloudError(409, 'studio-not-running')
    return { slug: row.slug, generation: row.generation, studio: `http://${row.address}:${STUDIO_PORT}`, control: `http://${row.address}:${CONTROL_PORT}`, controlToken: this.#sealer.open(row.control_token) }
  }
  /** Starts the Studio if needed and waits until it answers. */
  async running(spaceId: string, timeoutMs = 180_000): Promise<StudioConnection> {
    await this.start(spaceId)
    const until = Date.now() + timeoutMs
    for (;;) {
      const row = await this.#row(spaceId)
      if (row.state === 'running') return this.connection(spaceId)
      if (row.state === 'failed' || row.desired_state !== 'running') throw new CloudError(409, row.error_code ?? 'studio-not-running')
      if (Date.now() > until) throw new CloudError(504, 'studio-start-timeout')
      await new Promise(done => setTimeout(done, 1000))
    }
  }
  /** Calls the Studio container's control service. */
  async control(connection: StudioConnection, path: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<Response> {
    const { timeoutMs = 30_000, ...rest } = init
    const response = await fetch(new URL(path, connection.control), { ...rest, headers: { ...rest.headers as Record<string, string>, authorization: `Bearer ${connection.controlToken}` }, redirect: 'error', signal: AbortSignal.timeout(timeoutMs), ...rest.body ? { duplex: 'half' } : {} } as RequestInit)
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { error?: unknown }
      throw new CloudError(response.status === 404 ? 404 : response.status === 422 ? 422 : 502, typeof body.error === 'string' && /^[a-z-]{1,64}$/.test(body.error) ? body.error : 'studio-control-failed')
    }
    return response
  }
  /** The control token, for the runner's readiness check. */
  openToken(sealed: string): string { return this.#sealer.open(sealed) }
}

export interface StudioRunnerOptions {
  instanceId: string
  publicOrigins(slug: string): { studio: string, preview: string }
  /** Trusted services that join each Studio's private network: the runner (readiness) and the console (gateway). */
  connect: string[]
  storage: StudioStorage
}

/** The runner's side: makes containers match the desired states, with leases so replicas never act twice. */
export class StudioRunner {
  readonly db: Database
  readonly engine: DockerEngine
  readonly profile: StudioProfile
  readonly studios: Studios
  readonly options: StudioRunnerOptions
  constructor(studios: Studios, engine: DockerEngine, profile: StudioProfile, options: StudioRunnerOptions) {
    validateStudioProfile(profile)
    if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(options.instanceId)) throw new CloudError(500, 'runtime-configuration-invalid')
    this.db = studios.db; this.studios = studios; this.engine = engine; this.profile = profile; this.options = options
  }
  #labels(row: StudioRow) { return { [`${label}.instance`]: this.options.instanceId, [`${label}.kind`]: 'studio', [`${label}.id`]: row.space_id } }
  #container(row: StudioRow) { return `pm-${this.options.instanceId}-studio-${row.slug}-${row.generation}` }
  #network(row: StudioRow) { return `pm-${this.options.instanceId}-studio-${row.slug}` }
  #volume(row: StudioRow) { return `pm-${this.options.instanceId}-work-${row.slug}` }
  #managed(inspected: ContainerInspection, row: StudioRow) {
    return Object.entries(this.#labels(row)).every(([key, value]) => inspected.Config.Labels?.[key] === value) && inspected.Config.Labels?.[`${label}.generation`] === String(row.generation)
  }

  async reconcile(owner: string, limit = 8): Promise<number> {
    const claimed = await this.db.transaction(async sql => {
      const found = await sql.query<StudioRow>(`${SELECT} WHERE (t.state IN ('starting', 'running', 'stopping') OR t.desired_state = 'running') AND (t.lease_until IS NULL OR t.lease_until < now())
        ORDER BY t.updated_at FOR UPDATE OF t SKIP LOCKED LIMIT $1`, [limit])
      for (const row of found.rows) await sql.query(`UPDATE studios SET lease_owner = $2, lease_until = now() + interval '90 seconds' WHERE space_id = $1`, [row.space_id, owner])
      return found.rows
    })
    await Promise.allSettled(claimed.map(async row => {
      const heartbeat = setInterval(() => { void this.db.query(`UPDATE studios SET lease_until = now() + interval '90 seconds' WHERE space_id = $1 AND lease_owner = $2`, [row.space_id, owner]).catch(() => {}) }, 20_000)
      heartbeat.unref()
      try { await this.#reconcileOne(row, owner) }
      catch (error) {
        process.stderr.write(`studio ${row.slug}: ${error instanceof CloudError ? error.code : error instanceof Error ? error.message : String(error)}\n`)
        await this.db.query(`UPDATE studios SET error_code = 'studio-reconciliation-failed', lease_until = now() + interval '10 seconds' WHERE space_id = $1 AND lease_owner = $2`, [row.space_id, owner])
      } finally {
        clearInterval(heartbeat)
        await this.db.query(`UPDATE studios SET lease_owner = NULL, lease_until = now() + interval '1 second' WHERE space_id = $1 AND lease_owner = $2`, [row.space_id, owner])
      }
    }))
    return claimed.length
  }

  async #reconcileOne(original: StudioRow, owner: string): Promise<void> {
    let row = (await this.db.query<StudioRow>(`${SELECT} WHERE t.space_id = $1 AND t.lease_owner = $2`, [original.space_id, owner])).rows[0]
    if (!row) return
    let inspected = await this.engine.inspect(this.#container(row))
    if (inspected && !this.#managed(inspected, row)) throw new CloudError(409, 'runtime-container-ownership-mismatch')
    const expired = inspected?.State.Running && Date.parse(inspected.State.StartedAt) + this.profile.maxDurationSeconds * 1000 <= Date.now()
    const idle = row.state === 'running' && Date.now() - row.last_activity_at.getTime() >= this.profile.idleSeconds * 1000
    if (row.desired_state === 'stopped' || expired || idle) return this.#finish(row, inspected, owner)
    if (row.state === 'running') {
      // Studio ended by itself (crash, or the watchdog's deadline): the files stay, the container goes.
      if (!inspected?.State.Running) return this.#finish(row, inspected, owner, 'studio-ended')
      return
    }
    if (!inspected) {
      if (row.started_at) return this.#finish(row, inspected, owner, 'studio-ended')
      const { hostPath } = await this.options.storage.acquire({ kind: 'studio', id: row.space_id, bytes: this.profile.diskBytes })
      if (!hostPath.startsWith('/') || hostPath === '/' || /[\r\n\0]/.test(hostPath)) throw new CloudError(503, 'runtime-storage-invalid')
      await this.engine.volume(this.#volume(row), this.#labels(row), { type: 'none', o: 'bind', device: hostPath })
      await this.engine.network(this.#network(row), this.#labels(row), { internal: false, connect: this.options.connect })
      await this.engine.create(this.#container(row), await this.#configuration(row))
      inspected = await this.engine.inspect(this.#container(row))
      if (!inspected) throw new CloudError(502, 'runtime-container-create-failed')
    }
    // Re-read cancellation right before starting, after possibly slow image and volume operations.
    row = (await this.db.query<StudioRow>(`${SELECT} WHERE t.space_id = $1 AND t.lease_owner = $2 AND t.lease_until > now()`, [row.space_id, owner])).rows[0]
    if (!row) return
    if (row.desired_state !== 'running') return this.#finish(row, inspected, owner)
    if (!inspected.State.Running) {
      if (!inspected.State.StartedAt.startsWith('0001-')) return this.#finish(row, inspected, owner, 'studio-ended')
      await this.engine.start(inspected.Id)
      inspected = await this.engine.inspect(inspected.Id)
      if (!inspected?.State.Running) throw new CloudError(502, 'runtime-container-start-failed')
    }
    const address = inspected.NetworkSettings.Networks?.[this.#network(row)]?.IPAddress
    let ready = false
    if (address) {
      try { ready = (await fetch(`http://${address}:${CONTROL_PORT}/ready`, { headers: { authorization: `Bearer ${this.studios.openToken(row.control_token)}` }, signal: AbortSignal.timeout(3000), redirect: 'error' })).ok }
      catch { /* Starting until Studio answers. */ }
    }
    await this.db.query(`UPDATE studios SET container_id = $3, address = $4, started_at = coalesce(started_at, $5),
      state = CASE WHEN desired_state <> 'running' THEN 'stopping' WHEN $6 THEN 'running' ELSE 'starting' END,
      last_activity_at = CASE WHEN $6 AND state <> 'running' THEN now() ELSE last_activity_at END, updated_at = now()
      WHERE space_id = $1 AND lease_owner = $2`, [row.space_id, owner, inspected.Id, address ?? null, new Date(inspected.State.StartedAt), ready])
  }

  async #configuration(row: StudioRow): Promise<ContainerConfiguration> {
    const origins = this.options.publicOrigins(row.slug), profile = this.profile
    return {
      Image: profile.image, User: '1000:1000', WorkingDir: '/work', Cmd: [],
      Env: [
        `PRESMIUM_CLOUD_CONTROL_TOKEN=${this.studios.openToken(row.control_token)}`,
        `PRESMIUM_CLOUD_PUBLIC_URL=${origins.studio}/`,
        `PRESMIUM_CLOUD_PREVIEW_URL=${origins.preview}`,
        `PRESMIUM_CLOUD_USER_NAME=${row.owner_name.replace(/[\r\n\0]/g, ' ')}`,
        ...row.owner_email ? [`PRESMIUM_CLOUD_USER_EMAIL=${row.owner_email.replace(/[\r\n\0]/g, '')}`] : [],
        'TMPDIR=/tmp',
      ],
      Labels: { ...this.#labels(row), [`${label}.generation`]: String(row.generation), [`${label}.max-duration-seconds`]: String(profile.maxDurationSeconds) },
      HostConfig: {
        NetworkMode: this.#network(row), ReadonlyRootfs: true, CapDrop: ['ALL'], SecurityOpt: ['no-new-privileges:true', await runtimeSeccompSecurityOpt()],
        NanoCpus: Math.floor(profile.cpu * 1e9), Memory: profile.memoryBytes, MemorySwap: profile.memoryBytes, PidsLimit: profile.pidsLimit, Init: true,
        ...profile.runtime ? { Runtime: profile.runtime } : {},
        Mounts: [{ Type: 'volume', Source: this.#volume(row), Target: '/work' }],
        // `exec`: native addons (DeepSeek Harness's loader) are copied to /tmp and loaded from there.
        Tmpfs: { '/tmp': `rw,exec,nosuid,nodev,size=${profile.tmpBytes},mode=1777` },
        LogConfig: { Type: 'local', Config: { 'max-size': '5m', 'max-file': '2' } },
      },
    }
  }

  async #finish(row: StudioRow, inspected: ContainerInspection | undefined, owner: string, errorCode?: string): Promise<void> {
    if (inspected?.State.Running) { await this.engine.stop(inspected.Id, 20); inspected = await this.engine.inspect(inspected.Id) }
    if (inspected?.State.Running) throw new CloudError(502, 'runtime-container-stop-failed')
    if (errorCode && inspected) process.stderr.write(`studio ${row.slug} ended (exit ${inspected.State.ExitCode}${inspected.State.OOMKilled ? ', out of memory' : ''}):\n${(await this.engine.logs(inspected.Id).catch(() => '')).slice(-4000)}\n`)
    if (inspected) await this.engine.remove(inspected.Id)
    await this.engine.removeNetwork(this.#network(row), this.#labels(row), this.options.connect)
    await this.db.query(`UPDATE studios SET desired_state = 'stopped', state = $4, container_id = NULL, address = NULL, error_code = $5, updated_at = now()
      WHERE space_id = $1 AND lease_owner = $2 AND generation = $3 AND lease_until > now()`, [row.space_id, owner, row.generation, errorCode && !row.started_at ? 'failed' : 'stopped', errorCode ?? null])
  }

  async run(owner: string, signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      try { await this.reconcile(owner) }
      catch (error) { process.stderr.write(`studio runner: ${error instanceof CloudError ? error.code : error instanceof Error ? error.message : String(error)}\n`) }
      await new Promise<void>(done => {
        const timer = setTimeout(finish, 1000)
        function finish() { clearTimeout(timer); signal.removeEventListener('abort', finish); done() }
        signal.addEventListener('abort', finish, { once: true })
      })
    }
  }
}
