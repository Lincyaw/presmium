import { CreateBucketCommand, DeleteObjectsCommand, GetObjectCommand, HeadBucketCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { CloudError } from '../domain/errors.ts'
import type { CloudConfig } from './config.ts'

/** S3-compatible storage of shared documents: each share's source archive and built site, under `shares/<id>/`. */
export class ObjectStorage {
  readonly client: S3Client
  readonly bucket: string
  readonly config: CloudConfig['storage']
  constructor(config: CloudConfig['storage']) {
    this.config = config
    this.bucket = config.bucket
    this.client = new S3Client({ endpoint: config.endpoint, region: config.region, forcePathStyle: Boolean(config.endpoint), credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey }, maxAttempts: 2 })
  }

  async initialize(): Promise<void> {
    try { await this.client.send(new HeadBucketCommand({ Bucket: this.bucket })) }
    catch (error) {
      if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode !== 404) throw error
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket, ...this.config.region !== 'us-east-1' ? { CreateBucketConfiguration: { LocationConstraint: this.config.region as 'eu-west-1' } } : {} }))
    }
  }

  async put(key: string, body: Uint8Array, contentType: string): Promise<void> {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }))
  }

  async get(key: string): Promise<{ body: ReadableStream, contentType: string, bytes: number } | undefined> {
    try {
      const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }))
      if (!result.Body) throw new CloudError(503, 'storage-unavailable')
      return { body: result.Body.transformToWebStream(), contentType: result.ContentType ?? 'application/octet-stream', bytes: result.ContentLength ?? 0 }
    } catch (error) {
      if ((error as { name?: string }).name === 'NoSuchKey' || (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return undefined
      throw error
    }
  }

  async removePrefix(prefix: string): Promise<void> {
    if (!/^shares\/[a-f0-9-]{36}\/$/.test(prefix)) throw new CloudError(500, 'storage-prefix-invalid')
    let token: string | undefined
    do {
      const page = await this.client.send(new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken: token }))
      const keys = (page.Contents ?? []).flatMap(object => object.Key ? [{ Key: object.Key }] : [])
      if (keys.length) await this.client.send(new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: keys, Quiet: true } }))
      token = page.IsTruncated ? page.NextContinuationToken : undefined
    } while (token)
  }

  close(): void { this.client.destroy() }
}
