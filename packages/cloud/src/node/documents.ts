import { createHash, randomUUID } from 'node:crypto'
import { applyDocumentOperations, createDocumentPage, fnv1a64, validateDocument, validateDocumentChange } from '@lincyaw/kernel'
import type { DocumentAnswer, DocumentChange, DocumentChangeAnswer, TeachingDocument } from '@lincyaw/kernel'
import { CloudError, requireId, requireInteger, requireText } from '../domain/errors.ts'
import { stableJson } from '../domain/json.ts'
import { planOf } from '../domain/plans.ts'
import type { Database, Sql } from './database.ts'
import { Spaces } from './spaces.ts'

export interface ProjectFile { content: string, version: string }
export type ProjectFiles = Record<string, ProjectFile>
interface StoredVersion { id: string, content: TeachingDocument, fingerprint: string, files: ProjectFiles }
interface DocumentAccess { id: string, head_version: string, historyDays: number | null }
export interface HistoryQuery { cursor?: string, limit?: number, offset?: number, snapshot?: string }
export interface CloudHistoryRevision { id: string, parentId: string | null, message: string, date: string, author: string, userId: string, cursor: string }
export interface CloudHistoryPage { revisions: CloudHistoryRevision[], nextCursor: string | null, snapshot: string }
interface HistoryCursor { v: 1, document: string, snapshot: string, at: string, id: string }
export interface CloudPlan {
  planId: string
  document: string
  changeId: string
  source: { documentId: string, version: string, fingerprint: string }
  digest: string
  expiresAt: string
  content: TeachingDocument
  files: { path: string, base: string | null, version: string }[]
  predictedVersion: string
  metadata?: Record<string, unknown>
}

export const documentText = (content: TeachingDocument): string => `${stableJson(content, 2)}\n`
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const answer = (id: string, stored: StoredVersion): DocumentAnswer => ({ document: id, version: stored.id, fingerprint: stored.fingerprint, content: stored.content, issues: validateDocument(stored.content).issues })
const maxBytes = 2 << 20

function historyCursor(value: string, document: string): HistoryCursor {
  try {
    if (!/^[A-Za-z0-9_-]{1,2048}$/.test(value)) throw new Error()
    const cursor = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as HistoryCursor
    if (!cursor || cursor.v !== 1 || cursor.document !== document || typeof cursor.at !== 'string'
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(cursor.at)
      || new Date(cursor.at).toISOString().slice(0, 19) !== cursor.at.slice(0, 19)) throw new Error()
    requireId(cursor.snapshot); requireId(cursor.id)
    return cursor
  } catch { throw new CloudError(400, 'history-cursor-invalid') }
}
const cursorText = (document: string, snapshot: string, at: string, id: string) => Buffer.from(stableJson({ v: 1, document, snapshot, at, id } satisfies HistoryCursor)).toString('base64url')

function checkedChange(input: unknown): DocumentChange {
  let bytes: number
  try { bytes = Buffer.byteLength(JSON.stringify(input)) } catch { throw new CloudError(400, 'document-change-invalid') }
  if (bytes > maxBytes) throw new CloudError(413, 'document-too-large')
  const validated = validateDocumentChange(input)
  if (!validated.change) throw new CloudError(422, 'document-change-invalid', { issues: validated.issues.map(({ code, path }) => ({ code, path })) })
  return validated.change
}

function filePath(value: string): string {
  if (value.length > 500 || value.includes('\\') || value.includes('\0') || value.startsWith('/') || /^[a-z]:/i.test(value) || value.split('/').some(part => !part || part === '.' || part === '..') || value.split('/').some(part => ['.git', 'node_modules', '.presmium'].includes(part)) || value === 'lecture.json' || value === 'presmium.workspace.yaml') throw new CloudError(400, 'project-path-invalid')
  return value
}

function candidate(stored: StoredVersion, change: DocumentChange) {
  if (change.baseDocumentVersion !== stored.id) throw new CloudError(409, 'document-version-changed', { version: stored.id })
  let content: TeachingDocument
  try { content = change.replacement ?? applyDocumentOperations(stored.content, change.operations!) }
  catch { throw new CloudError(422, 'document-operation-invalid') }
  const validation = validateDocument(content)
  if (!validation.document || validation.issues.some(issue => issue.severity === 'error')) throw new CloudError(422, 'document-invalid', { issues: validation.issues.map(({ code, path }) => ({ code, path })) })
  if (content.id !== stored.content.id) throw new CloudError(409, 'document-identity-changed')
  const files = structuredClone(stored.files), paths = new Set<string>()
  for (const file of change.fileChanges ?? []) {
    const path = filePath(file.path)
    if (paths.has(path)) throw new CloudError(400, 'project-path-duplicate')
    paths.add(path)
    if ((files[path]?.version ?? null) !== file.base) throw new CloudError(409, 'project-file-version-changed', { path })
    files[path] = { content: file.content, version: hash(file.content) }
  }
  if (Buffer.byteLength(JSON.stringify(files)) + Buffer.byteLength(documentText(content)) > maxBytes) throw new CloudError(413, 'document-too-large')
  return { content, files, fingerprint: fnv1a64(documentText(content)) }
}

export class Documents {
  readonly db: Database
  readonly spaces: Spaces
  constructor(db: Database, spaces: Spaces) { this.db = db; this.spaces = spaces }

  private async document(sql: Sql, userId: string, spaceId: string, id: string, write = false): Promise<DocumentAccess> {
    const member = await this.spaces.authorize(userId, spaceId, write ? 'write' : 'read', sql)
    const result = await sql.query<{ id: string, head_version: string }>(`SELECT id,head_version FROM documents WHERE id=$1 AND space_id=$2 AND deleted_at IS NULL${write ? ' FOR UPDATE' : ''}`, [requireId(id), spaceId])
    if (!result.rows[0]) throw new CloudError(404, 'document-not-found')
    return { ...result.rows[0], historyDays: planOf(member.plan).historyDays }
  }

  private async version(sql: Sql, document: DocumentAccess, versionId: string): Promise<StoredVersion> {
    const result = await sql.query<StoredVersion & { history_allowed: boolean }>(`SELECT id,content,files,
      (id=$3 OR $4::integer IS NULL OR created_at>=now()-($4::integer*interval '1 day')) AS history_allowed
      FROM document_versions WHERE id=$1 AND document_id=$2`, [versionId, document.id, document.head_version, document.historyDays])
    const row = result.rows[0]
    if (!row) throw new CloudError(404, 'document-version-not-found')
    if (!row.history_allowed) throw new CloudError(403, 'history-plan-required', { historyDays: document.historyDays })
    return { id: row.id, content: row.content, files: row.files, fingerprint: fnv1a64(documentText(row.content)) }
  }

  async list(userId: string, spaceId: string) {
    await this.spaces.authorize(userId, spaceId)
    return (await this.db.query('SELECT d.id,d.title,d.head_version AS version,d.updated_at AS "updatedAt",v.content->\'metadata\'->>\'lang\' AS lang FROM documents d JOIN document_versions v ON v.id=d.head_version WHERE d.space_id=$1 AND d.deleted_at IS NULL ORDER BY d.updated_at DESC', [spaceId])).rows
  }

  async create(userId: string, spaceId: string, title: string, lang = 'zh-CN') {
    title = requireText(title, 'document-title-required', 1000)
    if (!['zh-CN', 'en'].includes(lang)) throw new CloudError(400, 'invalid-language')
    const empty: TeachingDocument = { schemaVersion: 1, id: randomUUID(), metadata: { title, lang }, sectionOrder: [], sections: {}, blocks: {}, steps: {}, narrations: {}, assets: {}, definitions: {}, production: { defaults: {}, stepOverrides: {}, mediaClips: [] } }
    const content = createDocumentPage(empty, null, title, randomUUID).document
    if (!validateDocument(content).document) throw new CloudError(500, 'document-template-invalid')
    return this.db.transaction(async sql => {
      await this.spaces.authorize(userId, spaceId, 'write', sql)
      const row = (await sql.query('INSERT INTO documents(space_id,title) VALUES($1,$2) RETURNING id', [spaceId, title])).rows[0]!
      const version = (await sql.query('INSERT INTO document_versions(document_id,content,fingerprint,user_id,message) VALUES($1,$2,$3,$4,$5) RETURNING id', [row.id, JSON.stringify(content), fnv1a64(documentText(content)), userId, 'document.created'])).rows[0]!
      await sql.query('UPDATE documents SET head_version=$2 WHERE id=$1', [row.id, version.id])
      await this.spaces.audit(sql, spaceId, userId, 'document.created', row.id)
      return { id: row.id, title, lang, version: version.id }
    })
  }

  async read(userId: string, spaceId: string, id: string): Promise<DocumentAnswer> {
    return this.db.transaction(async sql => {
      const row = await this.document(sql, userId, spaceId, id)
      return answer(id, await this.version(sql, row, row.head_version))
    })
  }

  async snapshot(userId: string, spaceId: string, id: string, versionId?: string) {
    return this.db.transaction(async sql => {
      const row = await this.document(sql, userId, spaceId, id)
      return this.version(sql, row, versionId ? requireId(versionId) : row.head_version)
    })
  }

  async plan(userId: string, spaceId: string, id: string, raw: unknown, metadata?: Record<string, unknown>): Promise<CloudPlan> {
    const change = checkedChange(raw), digest = hash(stableJson(change))
    return this.db.transaction(async sql => {
      const row = await this.document(sql, userId, spaceId, id, true)
      const prior = (await sql.query('SELECT digest,result FROM document_plans WHERE document_id=$1 AND user_id=$2 AND request_id=$3', [id, userId, change.id])).rows[0]
      if (prior) {
        if (prior.digest !== digest || stableJson(prior.result.metadata ?? null) !== stableJson(metadata ?? null)) throw new CloudError(409, 'operation-id-reused')
        return prior.result as CloudPlan
      }
      const stored = await this.version(sql, row, row.head_version), next = candidate(stored, change)
      const plan: CloudPlan = { planId: randomUUID(), document: id, changeId: change.id, source: { documentId: stored.content.id, version: stored.id, fingerprint: stored.fingerprint }, digest, expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(), content: next.content, files: [{ path: 'lecture.json', base: stored.id, version: next.fingerprint }, ...(change.fileChanges ?? []).map(file => ({ path: file.path, base: file.base, version: next.files[file.path]!.version }))], predictedVersion: randomUUID(), ...metadata ? { metadata } : {} }
      await sql.query('INSERT INTO document_plans(id,document_id,user_id,request_id,digest,payload,result,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [plan.planId, id, userId, change.id, digest, JSON.stringify(change), JSON.stringify(plan), plan.expiresAt])
      return plan
    })
  }

  async apply(userId: string, spaceId: string, id: string, planId: string, raw: unknown): Promise<DocumentChangeAnswer> {
    const change = checkedChange(raw), digest = hash(stableJson(change))
    return this.save(userId, spaceId, id, change, digest, requireId(planId))
  }

  async change(userId: string, spaceId: string, id: string, raw: unknown): Promise<DocumentChangeAnswer> {
    const change = checkedChange(raw)
    return this.save(userId, spaceId, id, change, hash(stableJson(change)))
  }

  private async save(userId: string, spaceId: string, id: string, change: DocumentChange, digest: string, planId?: string): Promise<DocumentChangeAnswer> {
    return this.db.transaction(async sql => {
      const row = await this.document(sql, userId, spaceId, id, true)
      const receipt = (await sql.query('SELECT digest,result FROM document_receipts WHERE document_id=$1 AND user_id=$2 AND request_id=$3', [id, userId, change.id])).rows[0]
      if (receipt) {
        if (receipt.digest !== digest) throw new CloudError(409, 'operation-id-reused')
        return receipt.result as DocumentChangeAnswer
      }
      let versionId: string = randomUUID()
      if (planId) {
        const plan = (await sql.query('SELECT * FROM document_plans WHERE id=$1 AND document_id=$2 AND user_id=$3', [planId, id, userId])).rows[0]
        if (!plan || plan.digest !== digest || plan.request_id !== change.id) throw new CloudError(409, 'document-plan-changed')
        if (new Date(plan.expires_at).getTime() <= Date.now()) throw new CloudError(409, 'document-plan-expired')
        versionId = (plan.result as CloudPlan).predictedVersion
      }
      const stored = await this.version(sql, row, row.head_version), next = candidate(stored, change)
      await sql.query('INSERT INTO document_versions(id,document_id,parent_id,content,fingerprint,files,user_id,message) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [versionId, id, stored.id, JSON.stringify(next.content), next.fingerprint, JSON.stringify(next.files), userId, planId ? 'document.agent-change' : 'document.saved'])
      await sql.query('UPDATE documents SET head_version=$2,title=$3,updated_at=now() WHERE id=$1', [id, versionId, next.content.metadata.title])
      const result: DocumentChangeAnswer = { ...answer(id, { ...next, id: versionId }), changeId: change.id, files: [{ path: 'lecture.json', version: versionId }, ...(change.fileChanges ?? []).map(file => ({ path: file.path, version: next.files[file.path]!.version }))] }
      await sql.query('INSERT INTO document_receipts(document_id,user_id,request_id,digest,result) VALUES($1,$2,$3,$4,$5)', [id, userId, change.id, digest, JSON.stringify(result)])
      await this.spaces.audit(sql, spaceId, userId, 'document.saved', id)
      await sql.query('SELECT pg_notify($1,$2)', ['presmium_document', JSON.stringify({ spaceId, document: id, version: versionId })])
      return result
    })
  }

  async history(userId: string, spaceId: string, id: string, query: HistoryQuery = {}): Promise<CloudHistoryRevision[]> {
    return (await this.historyPage(userId, spaceId, id, query)).revisions
  }

  async historyPage(userId: string, spaceId: string, id: string, query: HistoryQuery = {}): Promise<CloudHistoryPage> {
    const limit = requireInteger(query.limit ?? 100, 'history-limit-invalid', 1, 100)
    const offset = requireInteger(query.offset ?? 0, 'history-offset-invalid', 0, 1_000_000)
    const cursor = query.cursor === undefined ? undefined : historyCursor(query.cursor, requireId(id))
    if (offset > 0 && (!query.snapshot || cursor)) throw new CloudError(400, 'history-snapshot-required')
    if (cursor && query.snapshot && cursor.snapshot !== query.snapshot) throw new CloudError(409, 'history-snapshot-changed')
    return this.db.transaction(async sql => {
      const document = await this.document(sql, userId, spaceId, id)
      const snapshot = cursor?.snapshot ?? (query.snapshot ? requireId(query.snapshot) : document.head_version)
      await this.version(sql, document, snapshot)
      // Keep PostgreSQL's microseconds in the cursor: JavaScript Dates round them away.
      const rows = (await sql.query<{ id: string, parentId: string | null, message: string, date: Date, author: string, userId: string, cursor_at: string }>(`SELECT v.id,v.parent_id AS "parentId",v.message,v.created_at AS date,u.name AS author,v.user_id AS "userId",
        to_char(v.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_at
        FROM document_versions v JOIN users u ON u.id=v.user_id
        WHERE v.document_id=$1
          AND (v.id=$2 OR $3::integer IS NULL OR v.created_at>=now()-($3::integer*interval '1 day'))
          AND v.created_at<=(SELECT created_at FROM document_versions WHERE id=$4 AND document_id=$1)
          AND ($5::timestamptz IS NULL OR (v.created_at,v.id)<($5::timestamptz,$6::uuid))
        ORDER BY v.created_at DESC,v.id DESC LIMIT $7 OFFSET $8`, [id, document.head_version, document.historyDays, snapshot, cursor?.at ?? null, cursor?.id ?? null, limit + 1, offset])).rows
      const revisions = rows.slice(0, limit).map(row => ({ id: row.id, parentId: row.parentId, message: row.message, date: row.date.toISOString(), author: row.author, userId: row.userId, cursor: cursorText(id, snapshot, row.cursor_at, row.id) }))
      return { revisions, nextCursor: rows.length > limit ? revisions.at(-1)!.cursor : null, snapshot }
    })
  }

  async restore(userId: string, spaceId: string, id: string, input: { requestId: string, version: string, base: string }) {
    const requestId = requireText(input.requestId), target = requireId(input.version), base = requireId(input.base), digest = hash(stableJson({ restore: target, base }))
    return this.db.transaction(async sql => {
      const row = await this.document(sql, userId, spaceId, id, true)
      const receipt = (await sql.query('SELECT digest,result FROM document_receipts WHERE document_id=$1 AND user_id=$2 AND request_id=$3', [id, userId, requestId])).rows[0]
      if (receipt) { if (receipt.digest !== digest) throw new CloudError(409, 'operation-id-reused'); return receipt.result as DocumentChangeAnswer }
      if (row.head_version !== base) throw new CloudError(409, 'document-version-changed', { version: row.head_version })
      const previous = await this.version(sql, row, target), versionId = randomUUID()
      await sql.query('INSERT INTO document_versions(id,document_id,parent_id,content,fingerprint,files,user_id,message) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [versionId, id, base, JSON.stringify(previous.content), previous.fingerprint, JSON.stringify(previous.files), userId, `document.restore:${target}`])
      await sql.query('UPDATE documents SET head_version=$2,title=$3,updated_at=now() WHERE id=$1', [id, versionId, previous.content.metadata.title])
      const result: DocumentChangeAnswer = { ...answer(id, { ...previous, id: versionId }), changeId: requestId, files: [{ path: 'lecture.json', version: versionId }, ...Object.entries(previous.files).map(([path, file]) => ({ path, version: file.version }))] }
      await sql.query('INSERT INTO document_receipts(document_id,user_id,request_id,digest,result) VALUES($1,$2,$3,$4,$5)', [id, userId, requestId, digest, JSON.stringify(result)])
      await this.spaces.audit(sql, spaceId, userId, 'document.restored', id)
      await sql.query('SELECT pg_notify($1,$2)', ['presmium_document', JSON.stringify({ spaceId, document: id, version: versionId })])
      return result
    })
  }
}
