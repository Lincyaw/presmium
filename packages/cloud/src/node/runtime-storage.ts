import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { chmod, chown, lstat, mkdir, open, readFile, readdir, realpath, rm, statfs } from 'node:fs/promises'
import { isAbsolute, join, resolve } from 'node:path'
import { CloudError, requireId, requireInteger } from '../domain/errors.ts'
import type { Database } from './database.ts'
import { runtimeSeccompDigest } from './runtime-seccomp.ts'

export interface RuntimeStorageOptions { mountRoot: string, hostRoot: string, instanceId: string }
export interface RuntimeStorageReference { kind: 'studio', id: string }

/** Trusted host storage: a directory per Studio volume, allocated by the operator's pool. */
export interface StudioStorage {
  ready(): Promise<void>
  acquire(request: RuntimeStorageReference & { bytes: number }): Promise<{ hostPath: string }>
  release(reference: RuntimeStorageReference): Promise<void>
}
interface Slot {
  id: string
  path: string
  projectId: number
  bytes: number
  inodes: number
  probe: { blockErrno: 'EDQUOT' | 'ENOSPC', inodeErrno: 'EDQUOT' | 'ENOSPC', projectEscapeBlocked: true, seccompPolicySha256: string }
}
interface Manifest {
  version: 1
  instanceId: string
  hostRoot: string
  filesystemUuid: string
  filesystemBytes: number
  seccompPolicySha256: string
  verifiedAt: string
  slots: Slot[]
}
interface AllocationRow { slot_id: string, requested_bytes: string }

const xfsMagic = 0x58465342
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const validErrno = (value: unknown) => value === 'EDQUOT' || value === 'ENOSPC'
const location = (value: string) => isAbsolute(value) && value !== '/' && resolve(value) === value && /^\/[A-Za-z0-9_./-]+$/.test(value)

/** Allocates only provisioned, kernel-enforced project-quota directories. */
export class RuntimeStorage implements StudioStorage {
  readonly db: Database
  readonly options: RuntimeStorageOptions
  #registeredDigest: string | undefined

  constructor(db: Database, options: RuntimeStorageOptions) {
    if (!location(options.mountRoot) || !location(options.hostRoot) || !/^[a-z0-9][a-z0-9-]{0,40}$/.test(options.instanceId)) throw new CloudError(500, 'runtime-storage-configuration-invalid')
    this.db = db
    this.options = { ...options }
  }

  async #manifest(): Promise<{ manifest: Manifest, digest: string }> {
    const seccompDigest = await runtimeSeccompDigest()
    if (process.platform !== 'linux') throw new CloudError(503, 'runtime-storage-linux-required')
    const root = await lstat(this.options.mountRoot)
    if (!root.isDirectory() || root.isSymbolicLink() || root.uid !== 0 || (root.mode & 0o022) !== 0 || await realpath(this.options.mountRoot) !== this.options.mountRoot) throw new CloudError(503, 'runtime-storage-pool-invalid')
    const filesystem = await statfs(this.options.mountRoot)
    if (filesystem.type !== xfsMagic) throw new CloudError(503, 'runtime-storage-quota-required')
    const mounts = (await readFile('/proc/self/mountinfo', 'utf8')).split('\n')
    const mounted = mounts.find(line => line.split(' ')[4] === this.options.mountRoot)
    const properties = mounted?.split(' - ')[1]?.split(' ')
    if (properties?.[0] !== 'xfs' || !properties[2]?.split(',').some(value => value === 'prjquota' || value === 'pquota') || /(?:^|,)pqnoenforce(?:,|$)/.test(properties[2] ?? '')) throw new CloudError(503, 'runtime-storage-quota-required')
    const handle = await open(join(this.options.mountRoot, 'pool.json'), constants.O_RDONLY | constants.O_NOFOLLOW)
    let source: string
    try {
      const metadata = await handle.stat()
      if (!metadata.isFile() || metadata.uid !== 0 || (metadata.mode & 0o222) !== 0 || metadata.nlink !== 1 || metadata.size > 128 * 1024) throw new CloudError(503, 'runtime-storage-manifest-invalid')
      source = await handle.readFile('utf8')
    } finally { await handle.close() }
    let parsed: unknown
    try { parsed = JSON.parse(source) } catch { throw new CloudError(503, 'runtime-storage-manifest-invalid') }
    if (!record(parsed) || parsed.version !== 1 || parsed.instanceId !== this.options.instanceId || parsed.hostRoot !== this.options.hostRoot || parsed.seccompPolicySha256 !== seccompDigest
      || typeof parsed.filesystemUuid !== 'string' || !/^[a-f0-9-]{36}$/i.test(parsed.filesystemUuid)
      || !Number.isSafeInteger(parsed.filesystemBytes) || typeof parsed.verifiedAt !== 'string' || !Number.isFinite(Date.parse(parsed.verifiedAt))
      || !Array.isArray(parsed.slots) || !parsed.slots.length || parsed.slots.length > 256) throw new CloudError(503, 'runtime-storage-manifest-invalid')
    const ids = new Set<string>(), projects = new Set<number>()
    let total = 0
    for (const candidate of parsed.slots) {
      if (!record(candidate) || typeof candidate.id !== 'string' || !/^slot-\d{4}$/.test(candidate.id) || candidate.path !== `slots/${candidate.id}`
        || ids.has(candidate.id) || !Number.isSafeInteger(candidate.projectId) || (candidate.projectId as number) < 1 || projects.has(candidate.projectId as number)
        || !Number.isSafeInteger(candidate.bytes) || (candidate.bytes as number) < 64 * 1024 * 1024 || !Number.isSafeInteger(candidate.inodes) || (candidate.inodes as number) < 16
        || !record(candidate.probe) || candidate.probe.seccompPolicySha256 !== seccompDigest || candidate.probe.projectEscapeBlocked !== true || !validErrno(candidate.probe.blockErrno) || !validErrno(candidate.probe.inodeErrno)) throw new CloudError(503, 'runtime-storage-manifest-invalid')
      ids.add(candidate.id); projects.add(candidate.projectId as number); total += candidate.bytes as number
    }
    if (total >= (parsed.filesystemBytes as number)) throw new CloudError(503, 'runtime-storage-manifest-invalid')
    const parent = await lstat(join(this.options.mountRoot, 'slots'))
    if (!parent.isDirectory() || parent.isSymbolicLink() || parent.uid !== 0 || (parent.mode & 0o022) !== 0 || parent.dev !== root.dev) throw new CloudError(503, 'runtime-storage-pool-invalid')
    const manifest = parsed as unknown as Manifest
    await Promise.all(manifest.slots.map(slot => this.#checkSlot(slot, root.dev)))
    return { manifest, digest: createHash('sha256').update(source).digest('hex') }
  }

  async #checkSlot(slot: Slot, device?: number): Promise<string> {
    const path = join(this.options.mountRoot, slot.path)
    const [metadata, quota] = await Promise.all([lstat(path), statfs(path)])
    if (!metadata.isDirectory() || metadata.isSymbolicLink() || metadata.uid !== 1000 || device !== undefined && metadata.dev !== device
      || quota.type !== xfsMagic || quota.blocks <= 0 || quota.blocks * quota.bsize > slot.bytes || quota.files <= 0 || quota.files > slot.inodes) throw new CloudError(503, 'runtime-storage-quota-unverified')
    return path
  }

  async ready(): Promise<void> { await this.#pool() }

  async #pool() {
    const checked = await this.#manifest()
    if (this.#registeredDigest === checked.digest) return checked.manifest
    await this.db.transaction(async sql => {
      await sql.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`runtime.storage.pool:${this.options.instanceId}`])
      const existing = (await sql.query<{ filesystem_uuid: string, host_root: string, manifest_digest: string }>('SELECT filesystem_uuid, host_root, manifest_digest FROM cloud_runtime_storage_pools WHERE instance_id = $1', [this.options.instanceId])).rows[0]
      if (existing && (existing.filesystem_uuid !== checked.manifest.filesystemUuid || existing.host_root !== this.options.hostRoot || existing.manifest_digest !== checked.digest)) throw new CloudError(503, 'runtime-storage-pool-changed')
      await sql.query('INSERT INTO cloud_runtime_storage_pools (instance_id, filesystem_uuid, host_root, manifest_digest) VALUES ($1, $2, $3, $4) ON CONFLICT (instance_id) DO NOTHING', [this.options.instanceId, checked.manifest.filesystemUuid, this.options.hostRoot, checked.digest])
      await sql.query(`INSERT INTO cloud_runtime_storage_slots (instance_id, slot_id, project_id, capacity_bytes, inode_limit)
        SELECT $1, s->>'id', (s->>'projectId')::integer, (s->>'bytes')::bigint, (s->>'inodes')::bigint FROM jsonb_array_elements($2::jsonb) s
        ON CONFLICT (instance_id, slot_id) DO NOTHING`, [this.options.instanceId, JSON.stringify(checked.manifest.slots)])
      const registered = (await sql.query<{ slot_id: string, project_id: number, capacity_bytes: string, inode_limit: string }>('SELECT slot_id, project_id, capacity_bytes, inode_limit FROM cloud_runtime_storage_slots WHERE instance_id = $1', [this.options.instanceId])).rows
      if (registered.length !== checked.manifest.slots.length || registered.some(row => !checked.manifest.slots.some(slot => slot.id === row.slot_id && slot.projectId === row.project_id && slot.bytes === Number(row.capacity_bytes) && slot.inodes === Number(row.inode_limit)))) throw new CloudError(503, 'runtime-storage-pool-changed')
    })
    this.#registeredDigest = checked.digest
    return checked.manifest
  }

  #reference(reference: RuntimeStorageReference) {
    if (reference.kind !== 'studio') throw new CloudError(400, 'runtime-storage-reference-invalid')
    return [this.options.instanceId, reference.kind, requireId(reference.id)]
  }

  async acquire(request: RuntimeStorageReference & { bytes: number }): Promise<{ hostPath: string }> {
    const reference = this.#reference(request), bytes = requireInteger(request.bytes, 'runtime-storage-size-invalid', 1)
    const manifest = await this.#pool()
    if (!manifest.slots.some(slot => slot.bytes === bytes)) throw new CloudError(422, 'runtime-storage-size-unavailable')
    return this.db.transaction(async sql => {
      await sql.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`runtime.storage:${reference.join(':')}`])
      let allocation = (await sql.query<AllocationRow>('SELECT slot_id, requested_bytes FROM cloud_runtime_storage_slots WHERE instance_id = $1 AND resource_kind = $2 AND resource_id = $3 FOR UPDATE', reference)).rows[0]
      if (allocation && Number(allocation.requested_bytes) !== bytes) throw new CloudError(409, 'runtime-storage-allocation-changed')
      if (!allocation) {
        const free = (await sql.query<{ slot_id: string }>('SELECT slot_id FROM cloud_runtime_storage_slots WHERE instance_id = $1 AND resource_kind IS NULL AND capacity_bytes = $2 ORDER BY slot_id FOR UPDATE SKIP LOCKED LIMIT 1', [this.options.instanceId, bytes])).rows[0]
        if (!free) throw new CloudError(429, 'runtime-storage-pool-exhausted')
        const selected = manifest.slots.find(slot => slot.id === free.slot_id)!
        const path = await this.#checkSlot(selected)
        if ((await readdir(path)).length) throw new CloudError(503, 'runtime-storage-slot-not-empty')
        await chmod(path, 0o700)
        allocation = (await sql.query<AllocationRow>('UPDATE cloud_runtime_storage_slots SET resource_kind = $2, resource_id = $3, requested_bytes = $4, allocated_at = now() WHERE instance_id = $1 AND slot_id = $5 RETURNING slot_id, requested_bytes', [...reference, bytes, free.slot_id])).rows[0]!
      }
      const slot = manifest.slots.find(value => value.id === allocation!.slot_id)
      if (!slot) throw new CloudError(503, 'runtime-storage-pool-changed')
      await this.#checkSlot(slot)
      return { hostPath: join(this.options.hostRoot, slot.path) }
    })
  }

  /** Call only after the resource's container has actually been removed. */
  async release(reference: RuntimeStorageReference): Promise<void> {
    const values = this.#reference(reference), manifest = await this.#pool()
    await this.db.transaction(async sql => {
      await sql.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`runtime.storage:${values.join(':')}`])
      const allocated = (await sql.query<{ slot_id: string }>('SELECT slot_id FROM cloud_runtime_storage_slots WHERE instance_id = $1 AND resource_kind = $2 AND resource_id = $3 FOR UPDATE', values)).rows[0]
      if (!allocated) return
      const slot = manifest.slots.find(value => value.id === allocated.slot_id)
      if (!slot) throw new CloudError(503, 'runtime-storage-pool-changed')
      const path = await this.#checkSlot(slot)
      await chmod(path, 0o700)
      // Keep the quota-bearing root inode; fs.rm unlinks symlinks rather than following them.
      for (const child of await readdir(path)) await rm(join(path, child), { recursive: true, force: true, maxRetries: 2 })
      await this.#checkSlot(slot)
      await sql.query('UPDATE cloud_runtime_storage_slots SET resource_kind = NULL, resource_id = NULL, requested_bytes = NULL, allocated_at = NULL WHERE instance_id = $1 AND slot_id = $2', [this.options.instanceId, slot.id])
    })
  }
}

/**
 * Plain directories without a quota, for a loopback trial only (`CLOUD_STORAGE_UNENFORCED=true` requires
 * `CLOUD_ALLOW_INSECURE_LOOPBACK=true`): a Studio can fill the host's disk.
 */
export class UnenforcedStorage implements StudioStorage {
  readonly options: RuntimeStorageOptions
  constructor(options: RuntimeStorageOptions) {
    if (!location(options.mountRoot) || !location(options.hostRoot)) throw new CloudError(500, 'runtime-storage-configuration-invalid')
    this.options = { ...options }
  }
  async ready(): Promise<void> {
    const root = await lstat(this.options.mountRoot)
    if (!root.isDirectory() || root.isSymbolicLink()) throw new CloudError(503, 'runtime-storage-pool-invalid')
  }
  #path(reference: RuntimeStorageReference) {
    if (reference.kind !== 'studio') throw new CloudError(400, 'runtime-storage-reference-invalid')
    return join('unenforced', requireId(reference.id))
  }
  async acquire(request: RuntimeStorageReference & { bytes: number }): Promise<{ hostPath: string }> {
    const path = this.#path(request), mounted = join(this.options.mountRoot, path)
    await mkdir(join(this.options.mountRoot, 'unenforced'), { recursive: true, mode: 0o755 })
    await mkdir(mounted, { mode: 0o700 }).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'EEXIST') throw error })
    const metadata = await lstat(mounted)
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) throw new CloudError(503, 'runtime-storage-pool-invalid')
    if (metadata.uid !== 1000) await chown(mounted, 1000, 1000)
    return { hostPath: join(this.options.hostRoot, path) }
  }
  async release(reference: RuntimeStorageReference): Promise<void> {
    await rm(join(this.options.mountRoot, this.#path(reference)), { recursive: true, force: true, maxRetries: 2 })
  }
}
