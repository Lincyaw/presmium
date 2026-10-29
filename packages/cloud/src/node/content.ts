import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { extname } from 'node:path'
import type { Hono } from 'hono'
import { fnv1a64, irBlocks, isRecord, PREVIEW_REVISION } from '@lincyaw/kernel'
import type { IRDocument, IrAnswer, PreviewAnswer, PreviewRenderer, TeachingDocument } from '@lincyaw/kernel'
import { irRevision } from '@lincyaw/kernel/node'
import { APP_CONFIG_ELEMENT } from '@lincyaw/web/domain'
import type { AppConfig } from '@lincyaw/web/domain'
import { CloudError, requireId, requireText } from '../domain/errors.ts'
import type { AuthService } from './auth.ts'
import type { CloudConfig } from './config.ts'
import type { Database, Sql } from './database.ts'
import { documentText } from './documents.ts'
import type { Documents } from './documents.ts'
import { runtimePath } from './runtime-archive.ts'
import type { RuntimeJobInput, RuntimeOutput } from './runner.ts'
import type { Spaces } from './spaces.ts'
import type { ObjectStorage } from './storage.ts'
import type { Admission } from './admission.ts'

const reservedBase = '/__presmium_cloud__/'
const previewLifetimeMinutes = 30
const textLimit = 32 << 20
const sha = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex')
const same = (left: string, right: string) => { const a = Buffer.from(left), b = Buffer.from(right); return a.length === b.length && timingSafeEqual(a, b) }
const json = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c')
const isText = (path: string) => /\.(?:html?|css|[cm]?js|json|map|svg|xml|txt|csv|vtt|srt|md)$/i.test(path)
const mediaTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.cjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.map': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.pdf': 'application/pdf', '.wasm': 'application/wasm', '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.vtt': 'text/vtt; charset=utf-8', '.srt': 'application/x-subrip', '.csv': 'text/csv; charset=utf-8', '.md': 'text/markdown; charset=utf-8',
}
interface JobRow { id: string, workspace_id: string, input: RuntimeJobInput, output: RuntimeOutput[], finished_at: Date }
interface VersionRow { id: string, content: TeachingDocument }
interface PreviewRow { id: string, space_id: string, document_id: string, job_id: string, user_id: string, expires_at: Date }
interface PublicationRow { id: string, space_id: string, document_id: string, source_version: string, job_id: string, user_id: string, request_id: string, title: string, created_at: Date, revoked_at: Date | null }
interface Artifact { job: JobRow, version: VersionRow, fingerprint: string, sourceSha256: string, files: Map<string, RuntimeOutput> }
interface MountedArtifact { artifact: Artifact, root: string, private: boolean }
export interface ContentStatus { sourceVersion: string, fingerprint: string, forms: Partial<Record<PreviewRenderer, { jobId: string, finishedAt: string }>>, publications: Partial<Record<PreviewRenderer, { jobId: string, finishedAt: string }>>, static: true }
export interface Publication { id: string, sourceVersion: string, jobId: string, title: string, form: PreviewRenderer, url: string, createdAt: string, revokedAt: string | null }
export interface ContentDependencies { db: Database, spaces: Spaces, documents: Documents, storage?: ObjectStorage, config: CloudConfig, admission?: Admission }

/** Immutable renderer outputs are served only on the operator's separate content origin. */
export class ContentService {
  readonly deps: ContentDependencies
  #cached = new Map<string, Buffer>()
  #cacheBytes = 0
  #preparing = new Map<string, Promise<void>>()
  constructor(deps: ContentDependencies) {
    this.deps = deps
    if (new URL(deps.config.contentUrl).origin === new URL(deps.config.publicUrl).origin || new URL(deps.config.contentUrl).origin === new URL(deps.config.runtimeUrl).origin) throw new CloudError(500, 'configuration-content-origin-required')
  }
  #storage(): ObjectStorage {
    if (!this.deps.storage) throw new CloudError(503, 'content-storage-unavailable')
    return this.deps.storage
  }
  #sign(row: PreviewRow): string {
    const key = this.deps.config.inputSigningKey
    if (!key || key.length < 32) throw new CloudError(503, 'content-signing-unavailable')
    // Expiry is checked in the database, so an authenticated observer can renew
    // one capability without invalidating assets already loaded by its frame.
    return createHmac('sha256', key).update(`presmium.content.preview:v1:${row.id}:${row.space_id}:${row.document_id}:${row.job_id}:${row.user_id}`).digest('hex')
  }
  #url(root: string, form: PreviewRenderer, documentId?: string): string {
    const url = new URL(`${root}${form}/`, this.deps.config.contentUrl)
    if (documentId) url.searchParams.set('document', documentId)
    return url.href
  }
  async #latest(userId: string, spaceId: string, documentId: string) {
    const source = await this.deps.documents.read(requireId(userId), requireId(spaceId), requireId(documentId))
    const jobs = await this.deps.db.query<JobRow>(`SELECT DISTINCT ON(coalesce(input->>'audience','author'),input->>'form') id,workspace_id,input,output,finished_at FROM cloud_runtime_jobs
      WHERE workspace_id=$1 AND kind='compile' AND state='succeeded' AND input->>'documentId'=$2 AND input->>'sourceVersion'=$3
      AND input->>'form' IN ('web','slides') AND input->>'contentBase'=$4 || (input->>'form') || '/' AND output IS NOT NULL
      ORDER BY coalesce(input->>'audience','author'),input->>'form',finished_at DESC,id DESC`, [spaceId, documentId, source.version, reservedBase])
    return { source, jobs: jobs.rows }
  }
  async status(userId: string, spaceId: string, documentId: string): Promise<ContentStatus> {
    const { source, jobs } = await this.#latest(userId, spaceId, documentId)
    const forms: ContentStatus['forms'] = {}, publications: ContentStatus['publications'] = {}
    for (const job of jobs) {
      const artifact = await this.#artifact(job, documentId)
      await this.#ir(artifact, documentId, reservedBase)
      const target = job.input.audience === 'student' ? publications : forms
      target[job.input.form as PreviewRenderer] = { jobId: job.id, finishedAt: job.finished_at.toISOString() }
    }
    return { sourceVersion: source.version, fingerprint: source.fingerprint, forms, publications, static: true }
  }
  async #ready(userId: string, spaceId: string, documentId: string) {
    const deadline = Date.now() + 110_000
    for (;;) {
      const latest = await this.#latest(userId, spaceId, documentId)
      if (latest.jobs.some(job => job.input.form === 'web' && job.input.audience === undefined)) return latest
      if (!this.deps.admission) throw new CloudError(503, 'cloud-compilation-unavailable')
      const key = `${spaceId}:${documentId}:${latest.source.version}`
      let pending = this.#preparing.get(key)
      if (!pending) {
        const admission = this.deps.admission
        pending = (async () => {
          const end = Date.now() + 110_000
          let jobId: string | undefined
          for (;;) {
            try {
              const job = jobId ? await admission.readJob(userId, spaceId, jobId) : await admission.prepareJob(userId, spaceId, documentId)
              jobId = job.id
              if (job.state === 'succeeded') return
              if (job.state === 'failed') throw new CloudError(422, 'preview-build-failed', { jobId: job.id })
              if (job.state === 'cancelled') throw new CloudError(409, 'preview-build-cancelled')
            } catch (error) {
              if (!(error instanceof CloudError) || error.code !== 'runtime-job-limit') throw error
            }
            if (Date.now() >= end) throw new CloudError(503, 'preview-preparing', { retryAfterMs: 1000 })
            await new Promise(resolve => setTimeout(resolve, 750))
          }
        })().finally(() => { if (this.#preparing.get(key) === pending) this.#preparing.delete(key) })
        this.#preparing.set(key, pending)
      }
      await pending
      if (Date.now() >= deadline) throw new CloudError(503, 'preview-preparing', { retryAfterMs: 1000 })
    }
  }
  async #artifact(job: JobRow, documentId: string, sql: Sql = this.deps.db): Promise<Artifact> {
    if (!job || !['web', 'slides'].includes(job.input.form) || job.input.documentId !== documentId || job.input.contentBase !== `${reservedBase}${job.input.form}/`) throw new CloudError(409, 'cloud-output-binding-invalid')
    const version = (await sql.query<VersionRow>('SELECT id,content FROM document_versions WHERE id=$1 AND document_id=$2', [requireId(job.input.sourceVersion), documentId])).rows[0]
    if (!version) throw new CloudError(404, 'document-version-not-found')
    const source = documentText(version.content), entry = job.input.files.find(file => file.path === job.input.entry)
    if (!entry || runtimePath(job.input.entry) !== 'lecture.json' || entry.sha256 !== sha(source) || entry.bytes !== Buffer.byteLength(source)) throw new CloudError(409, 'cloud-output-source-invalid')
    const files = new Map<string, RuntimeOutput>()
    if (!Array.isArray(job.output) || job.output.length > 10_000) throw new CloudError(409, 'cloud-output-manifest-invalid')
    for (const file of job.output) {
      const path = runtimePath(file.path)
      if (files.has(path) || !/^[a-f0-9]{64}$/.test(file.sha256) || file.key !== `spaces/${job.workspace_id}/${file.sha256}` || !Number.isSafeInteger(file.bytes) || file.bytes < 0) throw new CloudError(409, 'cloud-output-manifest-invalid')
      files.set(path, file)
    }
    if (!files.has(`${job.input.form}/index.html`) || !files.has(`${job.input.form}/ir.json`)) throw new CloudError(409, 'cloud-output-entry-missing')
    return { job, version, fingerprint: fnv1a64(source), sourceSha256: sha(source), files }
  }
  async #job(spaceId: string, documentId: string, jobId: string, sql: Sql = this.deps.db): Promise<Artifact> {
    const job = (await sql.query<JobRow>(`SELECT id,workspace_id,input,output,finished_at FROM cloud_runtime_jobs WHERE id=$1 AND workspace_id=$2 AND kind='compile' AND state='succeeded' AND input->>'documentId'=$3`, [requireId(jobId), spaceId, documentId])).rows[0]
    if (!job) throw new CloudError(404, 'cloud-output-not-found')
    return this.#artifact(job, documentId, sql)
  }
  async #bytes(artifact: Artifact, file: RuntimeOutput): Promise<Buffer> {
    const cached = this.#cached.get(file.key!)
    if (cached) { this.#cached.delete(file.key!); this.#cached.set(file.key!, cached); return cached }
    if (file.bytes > textLimit) throw new CloudError(413, 'cloud-output-text-too-large')
    const found = await this.#storage().get(artifact.job.workspace_id, file.key!)
    if (found.bytes !== file.bytes || found.sha256 !== file.sha256) { await found.body.cancel(); throw new CloudError(409, 'cloud-output-object-changed') }
    const bytes = Buffer.from(await new Response(found.body).arrayBuffer())
    if (bytes.length !== file.bytes || sha(bytes) !== file.sha256) throw new CloudError(409, 'cloud-output-object-changed')
    this.#cached.set(file.key!, bytes); this.#cacheBytes += bytes.length
    while (this.#cacheBytes > 64 << 20 || this.#cached.size > 256) { const key = this.#cached.keys().next().value!; this.#cacheBytes -= this.#cached.get(key)!.length; this.#cached.delete(key) }
    return bytes
  }
  #sourceFile(artifact: Artifact, documentId: string, file: string): string | undefined {
    const relative = file.startsWith('/work/input/') ? file.slice('/work/input/'.length) : file
    return artifact.job.input.files.some(input => input.path === relative) ? `${documentId}/${relative}` : undefined
  }
  async #ir(artifact: Artifact, documentId: string, root: string, path = `${artifact.job.input.form}/ir.json`): Promise<{ doc: IRDocument, revision: string }> {
    const file = artifact.files.get(path)
    if (!file) throw new CloudError(404, 'cloud-output-file-not-found')
    let value: unknown
    try { value = JSON.parse((await this.#bytes(artifact, file)).toString('utf8')) } catch (error) { if (error instanceof CloudError) throw error; throw new CloudError(409, 'cloud-output-ir-invalid') }
    if (!isRecord(value) || !isRecord(value.source) || !isRecord(value.meta) || !Array.isArray(value.sections) || !Array.isArray(value.diagnostics)
      || value.source.documentId !== artifact.version.content.id || value.source.fingerprint !== artifact.fingerprint || value.source.version !== artifact.sourceSha256.slice(0, 20)
      || typeof value.meta.entry !== 'string' || this.#sourceFile(artifact, documentId, value.meta.entry) !== `${documentId}/${artifact.job.input.entry}`) throw new CloudError(409, 'cloud-output-provenance-invalid')
    const doc = value as unknown as IRDocument
    if (artifact.job.input.audience === 'student' && doc.meta.audience !== 'student') throw new CloudError(409, 'cloud-output-audience-invalid')
    doc.source = { documentId: artifact.version.content.id, version: artifact.version.id, fingerprint: artifact.fingerprint }
    doc.meta.entry = `${documentId}/${artifact.job.input.entry}`
    const source = (position: { file: string }) => { position.file = this.#sourceFile(artifact, documentId, position.file) ?? `cloud://generated/${artifact.job.id}` }
    for (const section of doc.sections) {
      source(section.source)
      for (const block of irBlocks(section.blocks)) { source(block.source); if (block.node.type === 'component' && block.node.definition) source(block.node.definition) }
    }
    for (const finding of doc.diagnostics) if (finding.source) source(finding.source)
    const revision = irRevision(doc)
    doc.meta[PREVIEW_REVISION] = revision
    return { doc: JSON.parse(JSON.stringify(doc).replaceAll(reservedBase, root)) as IRDocument, revision }
  }
  async #previewRoot(userId: string, spaceId: string, documentId: string, jobId: string): Promise<string> {
    const row = await this.deps.db.transaction(async sql => {
      await this.deps.spaces.authorize(userId, spaceId, 'read', sql)
      await sql.query("SELECT pg_advisory_xact_lock(hashtextextended('cloud.preview:' || $1 || ':' || $2,0))", [userId, jobId])
      await sql.query("DELETE FROM cloud_content_previews WHERE user_id=$1 AND expires_at<now()-interval '1 day'", [userId])
      const known = (await sql.query<PreviewRow>("SELECT * FROM cloud_content_previews WHERE user_id=$1 AND space_id=$2 AND document_id=$3 AND job_id=$4 AND revoked_at IS NULL AND expires_at>now() ORDER BY expires_at DESC LIMIT 1", [userId, spaceId, documentId, jobId])).rows[0]
      if (known) {
        await sql.query("UPDATE cloud_content_previews SET expires_at=greatest(expires_at,now()+($2*interval '1 minute')) WHERE id=$1", [known.id, previewLifetimeMinutes])
        return known
      }
      return (await sql.query<PreviewRow>("INSERT INTO cloud_content_previews(id,space_id,document_id,job_id,user_id,expires_at) VALUES($1,$2,$3,$4,$5,now()+($6*interval '1 minute')) RETURNING *", [randomUUID(), spaceId, documentId, jobId, userId, previewLifetimeMinutes])).rows[0]!
    })
    return `/v/${row.id}.${this.#sign(row)}/`
  }
  async preview(userId: string, spaceId: string, documentId: string, renderer: PreviewRenderer = 'web'): Promise<PreviewAnswer> {
    this.#storage()
    const { source, jobs } = await this.#ready(userId, spaceId, documentId)
    const own = jobs.find(job => job.input.form === 'web' && job.input.audience === undefined)
    if (!own) throw new CloudError(409, 'cloud-preview-required', { sourceVersion: source.version })
    const links: Partial<Record<PreviewRenderer, string>> = {}
    for (const job of jobs.filter(job => job.input.audience === undefined)) {
      const artifact = await this.#artifact(job, documentId), root = await this.#previewRoot(userId, spaceId, documentId, job.id)
      await this.#ir(artifact, documentId, root)
      links[job.input.form as PreviewRenderer] = this.#url(root, job.input.form as PreviewRenderer, documentId)
    }
    if (links.web) {
      const slides = new URL(links.web); slides.searchParams.set('form', 'slides')
      links.slides = slides.href
    }
    return { document: documentId, web: links.web ?? '', ...links.slides ? { slides: links.slides } : {} }
  }
  async ir(userId: string, spaceId: string, documentId: string): Promise<IrAnswer> {
    const { source, jobs } = await this.#ready(userId, spaceId, documentId), job = jobs.find(job => job.input.form === 'web' && job.input.audience === undefined)
    if (!job) throw new CloudError(409, 'cloud-preview-required', { sourceVersion: source.version })
    const artifact = await this.#artifact(job, documentId), root = await this.#previewRoot(userId, spaceId, documentId, job.id), { doc, revision } = await this.#ir(artifact, documentId, root)
    return { document: documentId, doc, revision, diagnostics: doc.diagnostics, sourceFingerprints: { [`${documentId}/lecture.json`]: artifact.fingerprint } }
  }
  /** An event subscription observes work already requested through the standard preview/output interface. */
  async observedIr(userId: string, spaceId: string, documentId: string): Promise<IrAnswer | undefined> {
    const { jobs } = await this.#latest(userId, spaceId, documentId), job = jobs.find(job => job.input.form === 'web' && job.input.audience === undefined)
    if (!job) return undefined
    const artifact = await this.#artifact(job, documentId), root = await this.#previewRoot(userId, spaceId, documentId, job.id), { doc, revision } = await this.#ir(artifact, documentId, root)
    return { document: documentId, doc, revision, diagnostics: doc.diagnostics, sourceFingerprints: { [`${documentId}/lecture.json`]: artifact.fingerprint } }
  }
  /** A particular completed job, including historical output, remains on the separate content origin. */
  async jobOutput(userId: string, spaceId: string, documentId: string, jobId: string): Promise<{ url: string, revision: string }> {
    await this.deps.documents.read(userId, spaceId, documentId)
    const artifact = await this.#job(spaceId, documentId, jobId), root = await this.#previewRoot(userId, spaceId, documentId, jobId)
    const { revision } = await this.#ir(artifact, documentId, root)
    return { url: new URL(root, this.deps.config.contentUrl).href, revision }
  }
  async revokePreviews(userId: string, spaceId: string, documentId: string): Promise<void> {
    await this.deps.spaces.authorize(requireId(userId), requireId(spaceId), 'read')
    await this.deps.db.query('UPDATE cloud_content_previews SET revoked_at=coalesce(revoked_at,now()) WHERE user_id=$1 AND space_id=$2 AND document_id=$3', [userId, spaceId, requireId(documentId)])
  }
  #publication(row: PublicationRow, form: PreviewRenderer): Publication {
    return { id: row.id, sourceVersion: row.source_version, jobId: row.job_id, title: row.title, form, url: this.#url(`/p/${row.id}/`, form), createdAt: row.created_at.toISOString(), revokedAt: row.revoked_at?.toISOString() ?? null }
  }
  async publications(userId: string, spaceId: string, documentId: string): Promise<Publication[]> {
    await this.deps.spaces.authorize(requireId(userId), requireId(spaceId), 'read')
    const rows = await this.deps.db.query<PublicationRow & { form: PreviewRenderer }>(`SELECT p.*,j.input->>'form' AS form FROM cloud_publications p JOIN cloud_runtime_jobs j ON j.id=p.job_id WHERE p.space_id=$1 AND p.document_id=$2 ORDER BY p.created_at DESC LIMIT 100`, [spaceId, requireId(documentId)])
    return rows.rows.map(row => this.#publication(row, row.form))
  }
  async publish(userId: string, spaceId: string, documentId: string, request: { requestId: string, jobId: string, sourceVersion: string }): Promise<Publication> {
    await this.deps.spaces.authorize(requireId(userId), requireId(spaceId), 'write')
    requireId(documentId); requireId(request.jobId); requireId(request.sourceVersion); requireText(request.requestId, 'publication-request-invalid', 120)
    const artifact = await this.#job(spaceId, documentId, request.jobId)
    if (artifact.job.input.audience !== 'student') throw new CloudError(409, 'publication-student-build-required')
    if (artifact.version.id !== request.sourceVersion) throw new CloudError(409, 'publication-source-changed')
    await this.#ir(artifact, documentId, reservedBase)
    await this.#html({ artifact, root: reservedBase, private: false }, (await this.#bytes(artifact, artifact.files.get(`${artifact.job.input.form}/index.html`)!)).toString('utf8'), new URL(this.deps.config.contentUrl), true)
    // Validate the complete immutable manifest before making an entry publicly reachable.
    const objects = (await this.deps.db.query<{ key: string, bytes: string, sha256: string }>('SELECT key,bytes::text,sha256 FROM objects WHERE space_id=$1 AND key=ANY($2::text[])', [spaceId, [...artifact.files.values()].map(file => file.key)])).rows
    const found = new Map(objects.map(object => [object.key, object]))
    for (const file of artifact.files.values()) if (found.get(file.key!)?.sha256 !== file.sha256 || Number(found.get(file.key!)?.bytes) !== file.bytes) throw new CloudError(409, 'cloud-output-object-changed')
    const row = await this.deps.db.transaction(async sql => {
      await this.deps.spaces.authorize(userId, spaceId, 'write', sql)
      await sql.query("SELECT pg_advisory_xact_lock(hashtextextended('cloud.publication:' || $1 || ':' || $2,0))", [documentId, userId])
      const known = (await sql.query<PublicationRow>('SELECT * FROM cloud_publications WHERE document_id=$1 AND user_id=$2 AND request_id=$3', [documentId, userId, request.requestId])).rows[0]
      if (known) { if (known.job_id !== request.jobId || known.source_version !== request.sourceVersion) throw new CloudError(409, 'operation-id-reused'); return known }
      const head = (await sql.query<{ head_version: string }>('SELECT head_version FROM documents WHERE id=$1 AND space_id=$2 AND deleted_at IS NULL FOR SHARE', [documentId, spaceId])).rows[0]
      if (head?.head_version !== request.sourceVersion) throw new CloudError(409, 'publication-source-changed')
      const inserted = (await sql.query<PublicationRow>('INSERT INTO cloud_publications(id,space_id,document_id,source_version,job_id,user_id,request_id,title) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *', [randomUUID(), spaceId, documentId, request.sourceVersion, request.jobId, userId, request.requestId, artifact.version.content.metadata.title])).rows[0]!
      await this.deps.spaces.audit(sql, spaceId, userId, 'document.published', inserted.id)
      return inserted
    })
    return this.#publication(row, artifact.job.input.form as PreviewRenderer)
  }
  async revokePublication(userId: string, spaceId: string, documentId: string, publicationId: string): Promise<void> {
    await this.deps.db.transaction(async sql => {
      await this.deps.spaces.authorize(requireId(userId), requireId(spaceId), 'write', sql)
      const result = await sql.query('UPDATE cloud_publications SET revoked_at=coalesce(revoked_at,now()) WHERE id=$1 AND space_id=$2 AND document_id=$3 RETURNING id', [requireId(publicationId), spaceId, requireId(documentId)])
      if (!result.rowCount) throw new CloudError(404, 'publication-not-found')
      await this.deps.spaces.audit(sql, spaceId, userId, 'document.publication-revoked', publicationId)
    })
  }
  async #mount(kind: 'v' | 'p', capability: string): Promise<MountedArtifact> {
    if (kind === 'p') {
      const row = (await this.deps.db.query<PublicationRow>('SELECT p.* FROM cloud_publications p JOIN documents d ON d.id=p.document_id AND d.deleted_at IS NULL WHERE p.id=$1 AND p.revoked_at IS NULL', [requireId(capability)])).rows[0]
      if (!row) throw new CloudError(404, 'publication-not-found')
      const artifact = await this.#job(row.space_id, row.document_id, row.job_id)
      if (artifact.job.input.audience !== 'student') throw new CloudError(409, 'publication-student-build-required')
      if (artifact.version.id !== row.source_version) throw new CloudError(409, 'publication-source-changed')
      return { artifact, root: `/p/${row.id}/`, private: false }
    }
    const match = /^([a-f0-9-]{36})\.([a-f0-9]{64})$/i.exec(capability)
    if (!match) throw new CloudError(404, 'content-preview-not-found')
    const row = (await this.deps.db.query<PreviewRow>('SELECT p.* FROM cloud_content_previews p JOIN documents d ON d.id=p.document_id AND d.deleted_at IS NULL WHERE p.id=$1 AND p.revoked_at IS NULL AND p.expires_at>now()', [requireId(match[1])])).rows[0]
    if (!row || !same(match[2]!, this.#sign(row))) throw new CloudError(404, 'content-preview-not-found')
    await this.deps.spaces.authorize(row.user_id, row.space_id, 'read')
    return { artifact: await this.#job(row.space_id, row.document_id, row.job_id), root: `/v/${capability}/`, private: true }
  }
  async #html(mounted: MountedArtifact, text: string, url: URL, requireConfig = false): Promise<string> {
    const { artifact, root } = mounted, documentId = artifact.job.input.documentId
    const expression = new RegExp(`(<script\\b[^>]*\\bid=["']${APP_CONFIG_ELEMENT}["'][^>]*>)([\\s\\S]*?)(<\\/script\\s*>)`, 'i')
    const matched = expression.exec(text)
    if (!matched) {
      if (requireConfig) throw new CloudError(409, 'cloud-output-viewer-config-missing')
      return text.replaceAll(reservedBase, root)
    }
    let config: AppConfig
    try { config = JSON.parse(matched[2]!) as AppConfig } catch { throw new CloudError(409, 'cloud-output-viewer-config-invalid') }
    if (config.kind !== 'document' && config.kind !== 'missing' && config.kind !== 'home') throw new CloudError(409, 'cloud-output-viewer-config-invalid')
    config.document = documentId
    config.origins = mounted.private ? [new URL(this.deps.config.publicUrl).origin] : []
    // A mounted capability serves this artifact only, even when another form was built in a separate job.
    for (const form of ['web', 'slides'] as const) {
      if (!artifact.files.has(`${form}/index.html`)) {
        delete config.site.links[form]
        delete config.site.links[`${form}Url`]
      }
    }
    delete config.events; delete config.source; delete config.serviceWorker
    if (mounted.private || url.searchParams.has('presmium-preview')) { config.rendered = false; delete config.page }
    const block = mounted.private ? url.searchParams.get('presmium-block') : null
    if (block !== null) {
      const { doc } = await this.#ir(artifact, documentId, root)
      if (!doc.sections.some(section => [...irBlocks(section.blocks)].some(node => node.id === block))) throw new CloudError(404, 'cloud-output-block-not-found')
      config.block = block; config.form = 'web'; delete config.page; delete config.search; config.rendered = false
    }
    // The output's own form is authoritative; static outputs have no live server transport.
    else config.form = url.searchParams.get('form') === 'slides' ? 'slides' : artifact.job.input.form as PreviewRenderer
    const replaced = text.slice(0, matched.index) + matched[1] + json(config) + matched[3] + text.slice(matched.index + matched[0].length)
    return replaced.replaceAll(reservedBase, root)
  }
  async serve(request: Request, kind: 'v' | 'p', capability: string, rest: string): Promise<Response> {
    const url = new URL(request.url)
    if (url.host !== new URL(this.deps.config.contentUrl).host) throw new CloudError(404, 'content-not-found')
    if (!['GET', 'HEAD'].includes(request.method) || request.headers.get('service-worker') === 'script') throw new CloudError(405, 'content-method-unavailable')
    const mounted = await this.#mount(kind, capability)
    let path: string
    try { path = decodeURIComponent(rest) } catch { throw new CloudError(400, 'cloud-output-path-invalid') }
    if (!path || path.endsWith('/')) path += 'index.html'
    path = runtimePath(path)
    if (!mounted.private && (!path.startsWith(`${mounted.artifact.job.input.form}/`) || path.split('/').some(part => part.startsWith('.')) || /(?:\.map|\.[cm]?tsx?)$/i.test(path) || /(?:^|\/)(?:lecture\.json|bundle\.json)$/i.test(path))) throw new CloudError(404, 'cloud-output-file-not-found')
    let file = mounted.artifact.files.get(path)
    if (!file && !extname(path)) { path += '.html'; file = mounted.artifact.files.get(path) }
    if (!file) throw new CloudError(404, 'cloud-output-file-not-found')
    const headers = new Headers({
      'Content-Type': mediaTypes[extname(path).toLowerCase()] ?? 'application/octet-stream',
      'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff',
      'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Resource-Policy': 'same-origin',
      'Content-Security-Policy': `frame-ancestors ${mounted.private ? new URL(this.deps.config.publicUrl).origin : '*'}; object-src 'none'; base-uri 'self'; form-action 'none'`,
    })
    if (isText(path)) {
      let bytes: Buffer, revision: string | undefined, unchanged = false
      if (/(?:^|\/)ir\.json$/.test(path)) { const ir = await this.#ir(mounted.artifact, mounted.artifact.job.input.documentId, mounted.root, path); bytes = Buffer.from(JSON.stringify(ir.doc)); revision = ir.revision }
      else {
        const raw = await this.#bytes(mounted.artifact, file)
        if (/\.html?$/i.test(path)) bytes = Buffer.from(await this.#html(mounted, raw.toString('utf8'), url, path === `${mounted.artifact.job.input.form}/index.html`))
        else if (raw.includes(reservedBase)) bytes = Buffer.from(raw.toString('utf8').replaceAll(reservedBase, mounted.root))
        else { bytes = raw; unchanged = true }
      }
      const etag = `"${unchanged ? file.sha256 : sha(bytes)}"`
      headers.set('Content-Length', String(bytes.length)); headers.set('ETag', etag)
      if (revision) headers.set('Presmium-Revision', revision)
      if (request.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers })
      return new Response(request.method === 'HEAD' ? null : new Uint8Array(bytes), { headers })
    }
    const object = await this.#storage().get(mounted.artifact.job.workspace_id, file.key!)
    if (object.bytes !== file.bytes || object.sha256 !== file.sha256) { await object.body.cancel(); throw new CloudError(409, 'cloud-output-object-changed') }
    headers.set('Content-Length', String(object.bytes)); headers.set('ETag', `"${object.sha256}"`)
    if (request.method === 'HEAD') { await object.body.cancel(); return new Response(null, { headers }) }
    return new Response(object.body, { headers })
  }
}

export function registerContentRoutes(app: Hono, deps: ContentDependencies & { auth: AuthService }): ContentService {
  const content = new ContentService(deps)
  const user = async (request: Request, mutate = false) => { if (mutate) await deps.auth.assertCsrf(request); return deps.auth.requireUser(request) }
  const base = '/api/spaces/:sid/documents/:id'
  app.get(`${base}/content`, async c => c.json(await content.status((await user(c.req.raw)).id, c.req.param('sid'), c.req.param('id'))))
  app.get(`${base}/preview`, async c => {
    const renderer = c.req.query('renderer') ?? 'web'
    if (renderer !== 'web' && renderer !== 'slides') throw new CloudError(400, 'preview-renderer-invalid')
    return c.json(await content.preview((await user(c.req.raw)).id, c.req.param('sid'), c.req.param('id'), renderer))
  })
  app.delete(`${base}/previews`, async c => { await content.revokePreviews((await user(c.req.raw, true)).id, c.req.param('sid'), c.req.param('id')); return c.json({ revoked: true }) })
  app.get(`${base}/publications`, async c => c.json({ publications: await content.publications((await user(c.req.raw)).id, c.req.param('sid'), c.req.param('id')) }))
  app.post(`${base}/publications`, async c => {
    const own = await user(c.req.raw, true), body = await c.req.json()
    if (!isRecord(body) || Object.keys(body).some(key => !['requestId', 'jobId', 'sourceVersion'].includes(key))) throw new CloudError(400, 'publication-request-invalid')
    return c.json({ publication: await content.publish(own.id, c.req.param('sid'), c.req.param('id'), { requestId: requireText(body.requestId), jobId: requireId(body.jobId), sourceVersion: requireId(body.sourceVersion) }) }, 201)
  })
  app.delete(`${base}/publications/:pid`, async c => { await content.revokePublication((await user(c.req.raw, true)).id, c.req.param('sid'), c.req.param('id'), c.req.param('pid')); return c.json({ revoked: true }) })
  for (const kind of ['v', 'p'] as const) app.all(`/${kind}/:cap/*`, c => {
    const prefix = `/${kind}/${c.req.param('cap')}/`
    return content.serve(c.req.raw, kind, c.req.param('cap'), c.req.path.slice(prefix.length))
  })
  return content
}
