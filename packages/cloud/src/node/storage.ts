import { createHash } from 'node:crypto'
import { CreateBucketCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { CloudError } from '../domain/errors.ts'
import type { CloudConfig } from './config.ts'
import type { Database } from './database.ts'
import { assertStorageCapacity, lockStorageAccount } from './runtime-storage-budget.ts'

export class ObjectStorage {
  readonly client: S3Client
  readonly db: Database
  readonly config: NonNullable<CloudConfig['storage']>
  constructor(db: Database, config: NonNullable<CloudConfig['storage']>) {
    this.db = db; this.config = config
    this.client = new S3Client({ endpoint: config.endpoint, region: config.region, forcePathStyle: Boolean(config.endpoint), credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey }, maxAttempts: 2 })
  }

  async initialize(): Promise<void> {
    try { await this.client.send(new HeadBucketCommand({ Bucket: this.config.bucket })) }
    catch (error) {
      if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode !== 404) throw error
      await this.client.send(new CreateBucketCommand({ Bucket: this.config.bucket, ...this.config.region !== 'us-east-1' ? { CreateBucketConfiguration: { LocationConstraint: this.config.region as 'eu-west-1' } } : {} }))
    }
  }

  async put(spaceId: string, bytes: Uint8Array, mediaType: string) {
    if (bytes.byteLength > 100 * 1024 * 1024) throw new CloudError(413, 'asset-too-large')
    const sha256 = createHash('sha256').update(bytes).digest('hex'), key = `spaces/${spaceId}/${sha256}`
    await this.db.transaction(async sql => {
      const found = (await sql.query<{ billing_account_id: string }>('SELECT billing_account_id FROM spaces WHERE id=$1', [spaceId])).rows[0]
      if (!found) throw new CloudError(404, 'space-not-found')
      const account = await lockStorageAccount(sql, found.billing_account_id)
      const space = (await sql.query('SELECT id,billing_account_id FROM spaces WHERE id=$1 FOR UPDATE', [spaceId])).rows[0]
      if (!space) throw new CloudError(404, 'space-not-found')
      if (space.billing_account_id !== found.billing_account_id) throw new CloudError(409, 'billing-account-changed')
      if ((await sql.query('SELECT key FROM objects WHERE key=$1', [key])).rowCount) return
      await assertStorageCapacity(sql, found.billing_account_id, account.plan, bytes.byteLength)
      // An unreferenced object on a failed DB commit is safe for later collection;
      // publishing metadata before the bytes would expose a missing canonical object.
      await this.client.send(new PutObjectCommand({ Bucket: this.config.bucket, Key: key, Body: bytes, ContentType: mediaType, Metadata: { sha256 } }))
      await sql.query('INSERT INTO objects(key,space_id,bytes,sha256,media_type) VALUES($1,$2,$3,$4,$5)', [key, spaceId, bytes.byteLength, sha256, mediaType])
    })
    return { key, sha256, bytes: bytes.byteLength }
  }

  async stat(spaceId: string, key: string): Promise<{ key: string, bytes: number, sha256: string, mediaType: string }> {
    const row = (await this.db.query('SELECT * FROM objects WHERE key=$1 AND space_id=$2', [key, spaceId])).rows[0]
    if (!row) throw new CloudError(404, 'asset-not-found')
    return { key: row.key, bytes: Number(row.bytes), sha256: row.sha256, mediaType: row.media_type }
  }

  async get(spaceId: string, key: string) {
    const row = await this.stat(spaceId, key)
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.config.bucket, Key: key }))
    if (!result.Body) throw new CloudError(503, 'asset-storage-unavailable')
    return { body: result.Body.transformToWebStream(), mediaType: row.mediaType, bytes: row.bytes, sha256: row.sha256 }
  }

  async close() { this.client.destroy() }
}
