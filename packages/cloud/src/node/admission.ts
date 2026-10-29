import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import type { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { CloudError, requireId, requireInteger, requireText } from '../domain/errors.ts'
import { stableJson } from '../domain/json.ts'
import type { AuthService } from './auth.ts'
import type { CloudConfig } from './config.ts'
import type { Database } from './database.ts'
import { documentText } from './documents.ts'
import type { Documents } from './documents.ts'
import { runtimeProfile, runtimeProfileDigest } from './environments.ts'
import type { EnvironmentView, RuntimeContext, RuntimeProfile } from './environments.ts'
import type { RuntimeClient } from './runtime-http.ts'
import type { RuntimeJobInput, RuntimeJobView } from './runner.ts'
import { runtimePath } from './runtime-archive.ts'
import type { Spaces } from './spaces.ts'
import type { ObjectStorage } from './storage.ts'
import type { Usage } from './usage.ts'

type JobKind = 'compile' | 'export-pdf'
interface InputFile { path: string, sha256: string, bytes: number, objectKey?: string }
interface QuoteRow {
  id: string, workspace_id: string, user_id: string, billing_account_id: string,
  kind: JobKind | 'environment', document_id: string | null, source_version: string | null,
  environment_id: string | null, environment_generation: number | null,
  profile_id: string, profile_snapshot: RuntimeProfile, profile_digest: string, input_manifest: InputFile[] | null,
  amount_minor: string, currency: string, expires_at: Date, state: 'quoted' | 'claimed' | 'completed' | 'rejected',
  request_id: string | null, result: Record<string, unknown> | null, error_code: string | null,
  audience: 'student' | null,
  output_form: RuntimeJobInput['form'] | null,
}
export interface AdmissionDependencies {
  db: Database
  spaces: Spaces
  documents: Documents
  usage: Usage
  storage?: ObjectStorage
  runtime?: Pick<RuntimeClient, 'call'>
  config: CloudConfig
}
export interface AdmissionQuote { id: string, amountMinor: number, currency: string, expiresAt: string, documentId?: string, sourceVersion?: string }
export interface EnvironmentAdmissionQuote extends AdmissionQuote { ratePerMinuteMinor: number, maxDurationSeconds: number }
export interface InputRefreshRequest { jobId: string, input: RuntimeJobInput, profileDigest: string }

const quoteLifetimeSeconds = 300
const inputLifetimeSeconds = 1800
const sha = (value: Buffer | string) => createHash('sha256').update(value).digest('hex')
const same = (left: string, right: string) => { const a = Buffer.from(left), b = Buffer.from(right); return a.length === b.length && timingSafeEqual(a, b) }
const quoteView = (quote: QuoteRow): AdmissionQuote => ({ id: quote.id, amountMinor: 0, currency: quote.currency, expiresAt: quote.expires_at.toISOString(), ...quote.document_id ? { documentId: quote.document_id, sourceVersion: quote.source_version! } : {} })
const imageMediaTypes: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp' }

function inputBinding(quote: QuoteRow, index: number, expires: number): string {
  return stableJson({ admissionId: quote.id, workspaceId: quote.workspace_id, userId: quote.user_id, billingAccountId: quote.billing_account_id, sourceVersion: quote.source_version, documentId: quote.document_id, profileDigest: quote.profile_digest, file: quote.input_manifest?.[index], index, expires })
}
function internalOrigin(config: CloudConfig): URL {
  const url = new URL(config.internalApiUrl)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new CloudError(500, 'runtime-input-origin-invalid')
  return url
}
function inputKey(config: CloudConfig): string {
  if (!config.inputSigningKey || config.inputSigningKey.length < 32) throw new CloudError(503, 'runtime-input-signing-unavailable')
  return config.inputSigningKey
}
function bodyFields(value: unknown, fields: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !fields.includes(key))) throw new CloudError(400, 'admission-request-invalid')
  return value as Record<string, unknown>
}

/** Durable quote acceptance is separate from dispatch, whose stable operation ID survives a lost RPC reply. */
export class Admission {
  readonly deps: AdmissionDependencies
  constructor(deps: AdmissionDependencies) { this.deps = deps; internalOrigin(deps.config) }
  #runtime(): Pick<RuntimeClient, 'call'> {
    if (!this.deps.runtime) throw new CloudError(503, 'runtime-unavailable')
    return this.deps.runtime
  }
  async #context(userId: string, workspaceId: string, capability: 'read' | 'execute' = 'read'): Promise<RuntimeContext> {
    const member = await this.deps.spaces.authorize(requireId(userId), requireId(workspaceId), capability)
    return { workspaceId, userId, billingAccountId: member.billingAccountId }
  }
  async #snapshot(context: RuntimeContext, documentId: string, version?: string) {
    const snapshot = await this.deps.documents.snapshot(context.userId, context.workspaceId, documentId, version)
    const files = [{ path: 'lecture.json', bytes: Buffer.from(documentText(snapshot.content)) }, ...Object.entries(snapshot.files).map(([path, file]) => ({ path: runtimePath(path), bytes: Buffer.from(file.content) }))].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
    const paths = new Set(files.map(file => file.path)), assets: InputFile[] = []
    for (const asset of Object.values(snapshot.content.assets)) {
      if (asset.kind !== 'image') throw new CloudError(503, 'runtime-asset-kind-unavailable')
      const match = /^assets\/([a-f0-9]{64})\.(png|jpe?g|gif|webp|svg|bmp)$/.exec(asset.location)
      if (!match) throw new CloudError(422, 'runtime-asset-location-invalid')
      const hash = match[1]!, mediaType = imageMediaTypes[match[2]!]!, path = runtimePath(asset.location)
      if (paths.has(path)) throw new CloudError(409, 'runtime-asset-path-collision')
      paths.add(path)
      if (!this.deps.storage) throw new CloudError(503, 'asset-storage-unavailable')
      const object = await this.deps.storage.stat(context.workspaceId, `spaces/${context.workspaceId}/${hash}`)
      if (object.sha256 !== hash || object.mediaType !== mediaType || (asset.mediaType && asset.mediaType !== mediaType)
        || (asset.fingerprint && asset.fingerprint !== `sha256:${hash}`) || !Number.isSafeInteger(object.bytes) || object.bytes < 1 || object.bytes > 8 * 1024 * 1024) throw new CloudError(422, 'runtime-asset-invalid')
      assets.push({ path, bytes: object.bytes, sha256: hash, objectKey: object.key })
    }
    return { snapshot, files, assets }
  }
  async quoteJob(userId: string, workspaceId: string, kind: string, documentId: string, profileId: string, audience?: 'student'): Promise<AdmissionQuote> {
    this.#runtime(); inputKey(this.deps.config)
    if (kind === 'export-video') throw new CloudError(503, 'runtime-video-export-unavailable')
    if (kind !== 'compile' && kind !== 'export-pdf') throw new CloudError(400, 'runtime-kind-invalid')
    if (audience !== undefined && (audience !== 'student' || kind !== 'compile')) throw new CloudError(400, 'runtime-audience-invalid')
    const context = await this.#context(userId, workspaceId), profile = runtimeProfile(this.deps.config.runtime.profiles, requireText(profileId), 'job')
    if (audience === 'student') await this.deps.spaces.authorize(userId, workspaceId, 'write')
    const { snapshot, files, assets } = await this.#snapshot(context, requireId(documentId))
    const manifest = [...files.map(file => ({ path: file.path, sha256: sha(file.bytes), bytes: file.bytes.length })), ...assets].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
    if (manifest.length > 10_000 || manifest.reduce((sum, file) => sum + file.bytes, 0) > (profile.maxInputBytes ?? 64 << 20)) throw new CloudError(413, 'runtime-input-limit')
    return quoteView(await this.#insert(context, kind, profile, { documentId, sourceVersion: snapshot.id, manifest, audience }))
  }
  async quoteEnvironment(userId: string, workspaceId: string, environmentId: string): Promise<EnvironmentAdmissionQuote> {
    const context = await this.#context(userId, workspaceId, 'execute')
    const environment = await this.#runtime().call<EnvironmentView>('environments', { action: 'get', context, environmentId: requireId(environmentId) })
    if (environment.state !== 'stopped' && environment.state !== 'failed') throw new CloudError(409, 'runtime-environment-busy')
    const profile = runtimeProfile(this.deps.config.runtime.profiles, environment.profileId, 'jupyter')
    const quote = await this.#insert(context, 'environment', profile, { environmentId, generation: environment.generation })
    return { ...quoteView(quote), ratePerMinuteMinor: 0, maxDurationSeconds: profile.maxDurationSeconds }
  }
  async #insert(context: RuntimeContext, kind: QuoteRow['kind'], profile: RuntimeProfile, input: { documentId?: string, sourceVersion?: string, manifest?: InputFile[], environmentId?: string, generation?: number, audience?: 'student', form?: RuntimeJobInput['form'] }, automatic = false, requestId?: string): Promise<QuoteRow> {
    return this.deps.db.transaction(async sql => {
      await this.deps.spaces.authorize(context.userId, context.workspaceId, kind === 'environment' ? 'execute' : input.audience === 'student' ? 'write' : 'read', sql)
      if (automatic) {
        await sql.query("SELECT pg_advisory_xact_lock(hashtextextended('cloud.output:' || $1 || ':' || $2 || ':' || $3,0))", [context.workspaceId, input.documentId, `${input.sourceVersion}:${input.form}:${kind}:${input.audience ?? 'author'}`])
        const known = (await sql.query<QuoteRow>(`SELECT q.* FROM cloud_admission_quotes q LEFT JOIN cloud_runtime_jobs j ON j.operation_id='admission:' || q.id::text AND j.billing_account_id=q.billing_account_id
          WHERE q.workspace_id=$1 AND q.document_id=$2 AND q.source_version=$3 AND q.kind=$4 AND coalesce(q.output_form,CASE WHEN q.kind='compile' THEN 'web' ELSE 'slides' END)=$5 AND q.audience IS NOT DISTINCT FROM $6 AND q.state IN ('claimed','completed')
          AND (j.id IS NULL OR j.state NOT IN ('failed','cancelled')) ORDER BY q.created_at DESC LIMIT 1`, [context.workspaceId, input.documentId, input.sourceVersion, kind, input.form, input.audience ?? null])).rows[0]
        if (known) return known
      }
      // Bounded outstanding quotes prevent free preflight from retaining unbounded manifests.
      await sql.query("SELECT pg_advisory_xact_lock(hashtextextended('cloud.quotes:' || $1,0))", [context.userId])
      if (requestId) {
        const known = (await sql.query<QuoteRow>('SELECT * FROM cloud_admission_quotes WHERE user_id=$1 AND request_id=$2', [context.userId, requestId])).rows[0]
        if (known) {
          if (known.workspace_id !== context.workspaceId || known.environment_id !== input.environmentId || known.kind !== kind) throw new CloudError(409, 'runtime-operation-reused')
          return known
        }
      }
      await sql.query("DELETE FROM cloud_admission_quotes WHERE user_id=$1 AND state='quoted' AND expires_at<now()-interval '1 day'", [context.userId])
      const count = Number((await sql.query<{ count: string }>("SELECT count(*)::text AS count FROM cloud_admission_quotes WHERE user_id=$1 AND state='quoted' AND expires_at>now()", [context.userId])).rows[0]!.count)
      if (count >= 50) throw new CloudError(429, 'admission-quote-limit')
      const account = (await sql.query<{ currency: string }>('SELECT currency FROM billing_accounts WHERE id=$1', [context.billingAccountId])).rows[0]
      if (!account) throw new CloudError(404, 'billing-account-not-found')
      const admitted = automatic || Boolean(requestId)
      const inserted = await sql.query<QuoteRow>(`INSERT INTO cloud_admission_quotes(id,workspace_id,user_id,billing_account_id,kind,document_id,source_version,environment_id,environment_generation,profile_id,profile_snapshot,profile_digest,input_manifest,amount_minor,currency,expires_at,audience,output_form,state,request_id)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,now()+($16*interval '1 second'),$17,$18,$19,$20) RETURNING *`, [randomUUID(), context.workspaceId, context.userId, context.billingAccountId, kind, input.documentId ?? null, input.sourceVersion ?? null, input.environmentId ?? null, input.generation ?? null, profile.id, JSON.stringify(profile), runtimeProfileDigest(profile), input.manifest ? JSON.stringify(input.manifest) : null, 0, account.currency, quoteLifetimeSeconds, input.audience ?? null, input.form ?? null, admitted ? 'claimed' : 'quoted', admitted ? requestId ?? randomUUID() : null])
      return inserted.rows[0]!
    })
  }
  async #claim(context: RuntimeContext, quoteId: string, requestId: string, kind: 'job' | 'environment', environmentId?: string): Promise<QuoteRow> {
    return this.deps.db.transaction(async sql => {
      await sql.query("SELECT pg_advisory_xact_lock(hashtextextended('cloud.quote.request:' || $1,0))", [context.userId])
      const quote = (await sql.query<QuoteRow>('SELECT * FROM cloud_admission_quotes WHERE id=$1 AND workspace_id=$2 AND user_id=$3 AND billing_account_id=$4 FOR UPDATE', [requireId(quoteId), context.workspaceId, context.userId, context.billingAccountId])).rows[0]
      if (!quote || (kind === 'environment') !== (quote.kind === 'environment') || (environmentId && quote.environment_id !== environmentId)) throw new CloudError(404, 'admission-quote-not-found')
      await this.deps.spaces.authorize(context.userId, context.workspaceId, kind === 'environment' ? 'execute' : quote.audience === 'student' ? 'write' : 'read', sql)
      const operation = requireText(requestId, 'runtime-operation-invalid', 120)
      if (quote.request_id && quote.request_id !== operation) throw new CloudError(409, 'admission-quote-already-used')
      if (quote.state === 'rejected') {
        // Older deployments marked a temporary busy observation terminal. Its
        // original operation identity remains the only safe recovery intent.
        if (quote.kind === 'environment' && quote.error_code === 'runtime-environment-busy') return (await sql.query<QuoteRow>("UPDATE cloud_admission_quotes SET state='claimed',error_code=NULL,updated_at=now() WHERE id=$1 RETURNING *", [quote.id])).rows[0]!
        throw new CloudError(409, quote.error_code ?? 'admission-quote-rejected')
      }
      if (quote.state !== 'quoted') return quote
      if (quote.expires_at.getTime() <= Date.now()) throw new CloudError(410, 'admission-quote-expired')
      const current = runtimeProfile(this.deps.config.runtime.profiles, quote.profile_id, quote.kind === 'environment' ? 'jupyter' : 'job')
      if (runtimeProfileDigest(current) !== quote.profile_digest) throw new CloudError(409, 'runtime-profile-changed')
      if (quote.document_id) {
        const document = (await sql.query<{ head_version: string }>('SELECT head_version FROM documents WHERE id=$1 AND space_id=$2 AND deleted_at IS NULL FOR SHARE', [quote.document_id, context.workspaceId])).rows[0]
        if (!document || document.head_version !== quote.source_version) throw new CloudError(409, 'admission-source-changed')
      }
      const existing = await sql.query('SELECT 1 FROM cloud_admission_quotes WHERE user_id=$1 AND request_id=$2 AND id<>$3', [context.userId, operation, quote.id])
      if (existing.rowCount) throw new CloudError(409, 'runtime-operation-reused')
      return (await sql.query<QuoteRow>("UPDATE cloud_admission_quotes SET state='claimed',request_id=$2,updated_at=now() WHERE id=$1 RETURNING *", [quote.id, operation])).rows[0]!
    })
  }
  async #dispatch(quote: QuoteRow, work: () => Promise<Record<string, unknown>>): Promise<Record<string, unknown>> {
    if (quote.result) return quote.result
    try {
      const result = await work()
      requireId(result.id)
      const saved = await this.deps.db.query<{ result: Record<string, unknown> }>("UPDATE cloud_admission_quotes SET state='completed',result=coalesce(result,$3),updated_at=now() WHERE id=$1 AND request_id=$2 RETURNING result", [quote.id, quote.request_id, JSON.stringify(result)])
      if (!saved.rows[0]) throw new CloudError(409, 'admission-quote-changed')
      return saved.rows[0].result
    } catch (error) {
      // Only an explicit, pre-admission refusal is terminal. Transport failures may hide a committed job.
      if (error instanceof CloudError && ['runtime-profile-changed', 'budget-exceeded', 'runtime-generation-changed'].includes(error.code)) await this.deps.db.query("UPDATE cloud_admission_quotes SET state='rejected',error_code=$3,updated_at=now() WHERE id=$1 AND request_id=$2 AND result IS NULL", [quote.id, quote.request_id, error.code])
      throw error
    }
  }
  async startJob(userId: string, workspaceId: string, quoteId: string, requestId: string): Promise<Record<string, unknown>> {
    const context = await this.#context(userId, workspaceId), quote = await this.#claim(context, quoteId, requestId, 'job')
    return this.#dispatch(quote, async () => {
      const input = this.#signedInput(quote)
      return this.#runtime().call<Record<string, unknown>>('jobs', { action: 'submit', context, operationId: `admission:${quote.id}`, kind: quote.kind === 'compile' ? 'compile' : 'export', profileId: quote.profile_id, input, expectedProfileDigest: quote.profile_digest })
    })
  }
  /** Standard workspace builds capture immutable source and share one background preparation per version. */
  async prepareJob(userId: string, workspaceId: string, documentId: string, target = 'web', source?: { version: string, fingerprint: string }): Promise<RuntimeJobView> {
    if (!['web', 'slides', 'pdf', 'notebook', 'web-student'].includes(target)) throw new CloudError(400, 'output-unavailable')
    const context = await this.#context(userId, workspaceId)
    if (target === 'web-student') await this.deps.spaces.authorize(userId, workspaceId, 'write')
    const profile = this.deps.config.runtime.profiles.find(value => value.kind === 'job' && value.id === (target === 'pdf' ? 'export' : 'compile')) ?? this.deps.config.runtime.profiles.find(value => value.kind === 'job')
    if (!profile) throw new CloudError(503, 'runtime-profile-unavailable')
    const { snapshot, files, assets } = await this.#snapshot(context, requireId(documentId))
    if (source && (source.version !== snapshot.id || source.fingerprint !== snapshot.fingerprint)) throw new CloudError(409, 'job-source-changed')
    const manifest = [...files.map(file => ({ path: file.path, sha256: sha(file.bytes), bytes: file.bytes.length })), ...assets].sort((left, right) => left.path.localeCompare(right.path))
    if (manifest.length > 10_000 || manifest.reduce((sum, file) => sum + file.bytes, 0) > (profile.maxInputBytes ?? 64 << 20)) throw new CloudError(413, 'runtime-input-limit')
    const form = target === 'pdf' ? 'slides' : target === 'web-student' ? 'web' : target as RuntimeJobInput['form']
    const quote = await this.#insert(context, target === 'pdf' ? 'export-pdf' : 'compile', profile, { documentId, sourceVersion: snapshot.id, manifest, form, ...target === 'web-student' ? { audience: 'student' as const } : {} }, true)
    const own = { workspaceId: quote.workspace_id, userId: quote.user_id, billingAccountId: quote.billing_account_id }
    const result = await this.#dispatch(quote, () => this.#runtime().call<Record<string, unknown>>('jobs', { action: 'submit', context: own, operationId: `admission:${quote.id}`, kind: quote.kind === 'compile' ? 'compile' : 'export', profileId: quote.profile_id, input: this.#signedInput(quote), expectedProfileDigest: quote.profile_digest }))
    return this.#runtime().call<RuntimeJobView>('jobs', { action: 'get', context, jobId: requireId(result.id) })
  }
  async readJob(userId: string, workspaceId: string, jobId: string): Promise<RuntimeJobView> {
    return this.#runtime().call<RuntimeJobView>('jobs', { action: 'get', context: await this.#context(userId, workspaceId), jobId: requireId(jobId) })
  }
  async cancelJob(userId: string, workspaceId: string, jobId: string): Promise<RuntimeJobView> {
    const context = await this.#context(userId, workspaceId), job = await this.readJob(userId, workspaceId, jobId)
    const member = await this.deps.spaces.authorize(userId, workspaceId)
    if (job.userId !== userId && member.role !== 'owner') throw new CloudError(403, 'permission-denied')
    return this.#runtime().call<RuntimeJobView>('jobs', { action: 'cancel', context, jobId })
  }
  async startFreeEnvironment(userId: string, workspaceId: string, environmentId: string, requestId: string): Promise<Record<string, unknown>> {
    requireText(requestId, 'runtime-operation-invalid', 120)
    const context = await this.#context(userId, workspaceId, 'execute')
    const known = (await this.deps.db.query<QuoteRow>('SELECT * FROM cloud_admission_quotes WHERE user_id=$1 AND request_id=$2', [userId, requestId])).rows[0]
    if (known) {
      if (known.kind !== 'environment' || known.workspace_id !== workspaceId || known.environment_id !== environmentId) throw new CloudError(409, 'runtime-operation-reused')
      return this.startEnvironment(userId, workspaceId, environmentId, known.id, requestId)
    }
    const environment = await this.#runtime().call<EnvironmentView>('environments', { action: 'get', context, environmentId: requireId(environmentId) })
    if (environment.state !== 'stopped' && environment.state !== 'failed') {
      // A concurrent delivery of this same durable intent may have started it
      // between the first receipt read and the environment observation.
      const replay = (await this.deps.db.query<QuoteRow>('SELECT * FROM cloud_admission_quotes WHERE user_id=$1 AND request_id=$2', [userId, requestId])).rows[0]
      if (replay) {
        if (replay.kind !== 'environment' || replay.workspace_id !== workspaceId || replay.environment_id !== environmentId) throw new CloudError(409, 'runtime-operation-reused')
        return this.startEnvironment(userId, workspaceId, environmentId, replay.id, requestId)
      }
      throw new CloudError(409, 'runtime-environment-busy')
    }
    const profile = runtimeProfile(this.deps.config.runtime.profiles, environment.profileId, 'jupyter')
    const quote = await this.#insert(context, 'environment', profile, { environmentId, generation: environment.generation }, false, requestId)
    return this.startEnvironment(userId, workspaceId, environmentId, quote.id, requestId)
  }
  async startEnvironment(userId: string, workspaceId: string, environmentId: string, quoteId: string, requestId: string): Promise<Record<string, unknown>> {
    const context = await this.#context(userId, workspaceId, 'execute'), quote = await this.#claim(context, quoteId, requestId, 'environment', requireId(environmentId))
    return this.#dispatch(quote, () => this.#runtime().call<Record<string, unknown>>('environments', { action: 'start', context, environmentId, operationId: `admission:${quote.id}`, expectedProfileDigest: quote.profile_digest, expectedGeneration: quote.environment_generation }))
  }
  #signedInput(quote: QuoteRow): RuntimeJobInput {
    if (!quote.document_id || !quote.source_version || !quote.input_manifest) throw new CloudError(409, 'runtime-input-manifest-unavailable')
    const expires = Math.floor(Date.now() / 1000) + inputLifetimeSeconds
    const key = inputKey(this.deps.config), origin = internalOrigin(this.deps.config)
    const form = quote.output_form ?? (quote.kind === 'compile' ? 'web' : 'slides')
    return { admissionId: quote.id, documentId: quote.document_id, sourceVersion: quote.source_version, entry: 'lecture.json', form, contentBase: `/__presmium_cloud__/${form}/`, ...quote.audience === 'student' ? { audience: 'student' as const } : {}, ...quote.kind === 'export-pdf' ? { format: 'pdf' as const } : {},
      files: quote.input_manifest.map((file, index) => {
        const url = new URL(`/internal/runtime-input/${quote.id}/${index}`, origin)
        url.searchParams.set('version', quote.source_version!)
        url.searchParams.set('expires', String(expires))
        url.searchParams.set('signature', createHmac('sha256', key).update(inputBinding(quote, index, expires)).digest('hex'))
        return { path: file.path, bytes: file.bytes, sha256: file.sha256, url: url.href }
      }) }
  }
  async #inputQuote(id: string): Promise<QuoteRow> {
    const row = (await this.deps.db.query<QuoteRow>('SELECT * FROM cloud_admission_quotes WHERE id=$1', [requireId(id)])).rows[0]
    if (!row || row.kind === 'environment' || !row.request_id || (row.state !== 'claimed' && row.state !== 'completed')) throw new CloudError(404, 'runtime-input-not-found')
    await this.#context(row.user_id, row.workspace_id)
    if (row.audience === 'student') await this.deps.spaces.authorize(row.user_id, row.workspace_id, 'write')
    return row
  }
  async refreshInput(admissionId: string, request: { jobId: string, sourceVersion: string, profileDigest: string }): Promise<RuntimeJobInput> {
    const quote = await this.#inputQuote(admissionId)
    if (request.sourceVersion !== quote.source_version || request.profileDigest !== quote.profile_digest) throw new CloudError(409, 'runtime-input-manifest-changed')
    const job = (await this.deps.db.query<{ input: RuntimeJobInput, profile_snapshot: RuntimeProfile }>(`SELECT input,profile_snapshot FROM cloud_runtime_jobs WHERE id=$1 AND workspace_id=$2 AND user_id=$3 AND billing_account_id=$4 AND operation_id=$5 AND state IN ('starting','queued')`, [requireId(request.jobId), quote.workspace_id, quote.user_id, quote.billing_account_id, `admission:${quote.id}`])).rows[0]
    if (!job || job.input.admissionId !== quote.id || job.input.sourceVersion !== quote.source_version || runtimeProfileDigest(job.profile_snapshot) !== quote.profile_digest) throw new CloudError(403, 'runtime-input-unauthorized')
    return this.#signedInput(quote)
  }
  async input(admissionId: string, indexValue: string, version: string, expiryValue: string, signature: string): Promise<{ bytes: Buffer, sha256: string }> {
    if (!/^\d{1,5}$/.test(indexValue) || !/^\d{1,16}$/.test(expiryValue) || !/^[a-f0-9]{64}$/.test(signature)) throw new CloudError(401, 'runtime-input-signature-invalid')
    const expires = Number(expiryValue), now = Math.floor(Date.now() / 1000)
    if (!Number.isSafeInteger(expires) || expires < now || expires > now + inputLifetimeSeconds + 60) throw new CloudError(401, 'runtime-input-expired')
    const quote = await this.#inputQuote(admissionId), index = Number(indexValue), file = quote.input_manifest?.[index]
    if (!file || version !== quote.source_version || !same(signature, createHmac('sha256', inputKey(this.deps.config)).update(inputBinding(quote, index, expires)).digest('hex'))) throw new CloudError(401, 'runtime-input-signature-invalid')
    const job = await this.deps.db.query('SELECT 1 FROM cloud_runtime_jobs WHERE operation_id=$1 AND workspace_id=$2 AND user_id=$3 AND state IN (\'queued\',\'starting\',\'running\')', [`admission:${quote.id}`, quote.workspace_id, quote.user_id])
    if (!job.rowCount) throw new CloudError(403, 'runtime-input-unauthorized')
    const { snapshot, files, assets } = await this.#snapshot({ workspaceId: quote.workspace_id, userId: quote.user_id, billingAccountId: quote.billing_account_id }, quote.document_id!, quote.source_version!)
    if (file.objectKey) {
      const asset = assets.find(candidate => candidate.path === file.path && candidate.objectKey === file.objectKey && candidate.bytes === file.bytes && candidate.sha256 === file.sha256)
      if (snapshot.id !== quote.source_version || !asset || !this.deps.storage) throw new CloudError(409, 'runtime-input-manifest-changed')
      const object = await this.deps.storage.get(quote.workspace_id, file.objectKey), reader = object.body.getReader(), chunks: Uint8Array[] = []
      let length = 0
      try {
        if (object.bytes !== file.bytes || object.sha256 !== file.sha256) throw new CloudError(409, 'runtime-input-manifest-changed')
        while (true) {
          const next = await reader.read()
          if (next.done) break
          length += next.value.length
          if (length > file.bytes) throw new CloudError(413, 'runtime-input-size-mismatch')
          chunks.push(next.value)
        }
      } finally { await reader.cancel().catch(() => {}) }
      const bytes = Buffer.concat(chunks, length)
      if (length !== file.bytes || sha(bytes) !== file.sha256) throw new CloudError(422, 'runtime-input-integrity-failed')
      return { bytes, sha256: file.sha256 }
    }
    const found = files.find(candidate => candidate.path === file.path)
    if (snapshot.id !== quote.source_version || !found || found.bytes.length !== file.bytes || sha(found.bytes) !== file.sha256) throw new CloudError(409, 'runtime-input-manifest-changed')
    return { bytes: found.bytes, sha256: file.sha256 }
  }
  async outputs(userId: string, workspaceId: string, jobId: string): Promise<RuntimeJobView> {
    const member = await this.deps.spaces.authorize(requireId(userId), requireId(workspaceId), 'read')
    return this.#runtime().call<RuntimeJobView>('jobs', { action: 'get', context: { workspaceId, userId, billingAccountId: member.billingAccountId }, jobId: requireId(jobId) })
  }
}

/** Trusted worker renews expiring download capabilities immediately before materializing the same version. */
export async function refreshRuntimeInput(config: CloudConfig, request: InputRefreshRequest): Promise<RuntimeJobInput> {
  if (!request.input.admissionId || !config.runner?.token) throw new CloudError(503, 'runtime-input-refresh-unavailable')
  const response = await fetch(new URL(`/internal/runtime-input/${requireId(request.input.admissionId)}/refresh`, internalOrigin(config)), {
    method: 'POST', headers: { Authorization: `Bearer ${config.runner.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobId: request.jobId, sourceVersion: request.input.sourceVersion, profileDigest: request.profileDigest }), signal: AbortSignal.timeout(15_000), redirect: 'error',
  })
  const result = await response.json() as { input?: RuntimeJobInput, error?: string }
  if (!response.ok || !result.input) throw new CloudError(response.status >= 400 ? response.status : 502, result.error ?? 'runtime-input-refresh-failed')
  return result.input
}

export function registerAdmissionRoutes(app: Hono, deps: AdmissionDependencies & { auth: AuthService }): Admission {
  const admission = new Admission(deps)
  const identity = async (request: Request, mutation = false) => { if (mutation) await deps.auth.assertCsrf(request); return deps.auth.requireUser(request) }
  app.post('/api/spaces/:sid/jobs/quote', async c => {
    const user = await identity(c.req.raw, true), body = bodyFields(await c.req.json(), ['kind', 'documentId', 'profileId', 'audience'])
    if (body.audience !== undefined && body.audience !== 'student') throw new CloudError(400, 'runtime-audience-invalid')
    return c.json({ quote: await admission.quoteJob(user.id, c.req.param('sid'), requireText(body.kind), requireId(body.documentId), requireText(body.profileId), body.audience) })
  })
  app.post('/api/spaces/:sid/jobs', async c => {
    const user = await identity(c.req.raw, true), body = bodyFields(await c.req.json(), ['quoteId', 'requestId'])
    return c.json({ job: await admission.startJob(user.id, c.req.param('sid'), requireId(body.quoteId), requireText(body.requestId)) }, 201)
  })
  app.get('/api/spaces/:sid/environments/:id/quote', async c => c.json({ quote: await admission.quoteEnvironment((await identity(c.req.raw)).id, c.req.param('sid'), requireId(c.req.param('id'))) }))
  app.post('/api/spaces/:sid/environments/:id/start', async c => {
    const user = await identity(c.req.raw, true), body = bodyFields(await c.req.json(), ['quoteId', 'requestId'])
    const environment = body.quoteId === undefined
      ? await admission.startFreeEnvironment(user.id, c.req.param('sid'), requireId(c.req.param('id')), requireText(body.requestId))
      : await admission.startEnvironment(user.id, c.req.param('sid'), requireId(c.req.param('id')), requireId(body.quoteId), requireText(body.requestId))
    return c.json({ environment: { ...environment, status: environment.state, ownerId: environment.userId } })
  })
  app.use('/internal/runtime-input/*', bodyLimit({ maxSize: 4096, onError: c => c.json({ error: 'request-too-large' }, 413) }))
  app.post('/internal/runtime-input/:id/refresh', async c => {
    if (!deps.config.runner?.token || !same(c.req.header('authorization') ?? '', `Bearer ${deps.config.runner.token}`)) throw new CloudError(401, 'runtime-unauthorized')
    const body = bodyFields(await c.req.json(), ['jobId', 'sourceVersion', 'profileDigest'])
    return c.json({ input: await admission.refreshInput(c.req.param('id'), { jobId: requireId(body.jobId), sourceVersion: requireId(body.sourceVersion), profileDigest: requireText(body.profileDigest, 'runtime-profile-digest-required', 64) }) })
  })
  app.get('/internal/runtime-input/:id/:index', async c => {
    const file = await admission.input(c.req.param('id'), c.req.param('index'), c.req.query('version') ?? '', c.req.query('expires') ?? '', c.req.query('signature') ?? '')
    return new Response(new Uint8Array(file.bytes), { headers: { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store', 'Content-Length': String(file.bytes.length), 'Presmium-SHA256': file.sha256, 'X-Content-Type-Options': 'nosniff' } })
  })
  app.get('/api/spaces/:sid/jobs/:id/outputs', async c => {
    const user = await identity(c.req.raw), job = await admission.outputs(user.id, c.req.param('sid'), c.req.param('id'))
    return c.json({ files: (job.output ?? []).map((file, index) => ({ ...file, index })).filter(file => !file.path.startsWith('_presmium/')).map(file => ({ path: file.path, bytes: file.bytes, sha256: file.sha256, url: `/api/spaces/${c.req.param('sid')}/jobs/${job.id}/outputs/${file.index}` })) })
  })
  app.get('/api/spaces/:sid/jobs/:id/outputs/:index', async c => {
    const user = await identity(c.req.raw), job = await admission.outputs(user.id, c.req.param('sid'), c.req.param('id'))
    const index = requireInteger(Number(c.req.param('index')), 'runtime-output-not-found', 0, 10_000), file = job.output?.[index]
    if (!file?.key || file.path.startsWith('_presmium/')) throw new CloudError(404, 'runtime-output-not-found')
    if (!deps.storage) throw new CloudError(503, 'asset-storage-unavailable')
    const object = await deps.storage.get(c.req.param('sid'), file.key)
    const filename = encodeURIComponent(file.path.split('/').at(-1) ?? 'output').replace(/['()*]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)
    return new Response(object.body, { headers: { 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename*=UTF-8''${filename}`, 'Content-Length': String(object.bytes), 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' } })
  })
  return admission
}
