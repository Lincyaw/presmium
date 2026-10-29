import { randomBytes, randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import type { ReadableStream as NodeReadableStream } from 'node:stream/web'
import type { Hono } from 'hono'
import { contentType } from 'mime-types'
import { Parser } from 'tar'
import type { ReadEntry } from 'tar'
import { CloudError, requireId, requireText } from '../domain/errors.ts'
import type { CloudUser } from './auth.ts'
import type { Database } from './database.ts'
import type { ObjectStorage } from './storage.ts'
import type { Studios } from './studios.ts'

/**
 * A share is a snapshot of one document: its committed source (what a fork copies) and its web form built for the
 * content origin (what a visitor reads at `/p/<slug>/`). The link's slug is the only key to it.
 */
const SITE_FILE_LIMIT = 64 << 20
const SITE_TOTAL_LIMIT = 512 << 20
const SOURCE_LIMIT = 256 << 20

interface ShareRow { id: string, slug: string, space_id: string, user_id: string, document: string, title: string, state: 'pending' | 'ready' | 'failed', error_code: string | null, created_at: Date, owner_name?: string }
const view = (row: ShareRow, contentUrl: string) => ({ id: row.id, slug: row.slug, document: row.document, title: row.title, state: row.state, errorCode: row.error_code, createdAt: row.created_at.toISOString(), siteUrl: new URL(`/p/${row.slug}/`, contentUrl).href })
const slugOf = () => randomBytes(16).toString('base64url')
const validSlug = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{22}$/.test(value)

async function body(response: Response, limit: number): Promise<Buffer> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of Readable.fromWeb(response.body as NodeReadableStream)) {
    size += chunk.length
    if (size > limit) throw new CloudError(413, 'share-too-large')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

/** The plain files of a gzipped tar, by their relative paths. */
async function files(response: Response): Promise<Map<string, Buffer>> {
  const found = new Map<string, Buffer>(), pending: Promise<void>[] = []
  let total = 0, failure: CloudError | undefined
  const parser = new Parser({
    onReadEntry(entry: ReadEntry) {
      const path = entry.path.replace(/^\.\//, '')
      if (entry.type !== 'File' || !path || path.split('/').some(part => !part || part === '.' || part === '..') || entry.size > SITE_FILE_LIMIT || (total += entry.size) > SITE_TOTAL_LIMIT) {
        if (entry.type === 'File' && total > SITE_TOTAL_LIMIT) failure = new CloudError(413, 'share-too-large')
        entry.resume()
        return
      }
      pending.push(entry.concat().then(bytes => { found.set(path, Buffer.from(bytes)) }))
    },
  })
  await new Promise<void>((done, fail) => {
    parser.on('end', () => done())
    parser.on('error', fail)
    Readable.fromWeb(response.body as NodeReadableStream).on('error', fail).pipe(parser)
  })
  await Promise.all(pending)
  if (failure) throw failure
  return found
}

export class Shares {
  readonly db: Database
  readonly storage: ObjectStorage
  readonly studios: Studios
  readonly contentUrl: string
  constructor(db: Database, storage: ObjectStorage, studios: Studios, contentUrl: string) { this.db = db; this.storage = storage; this.studios = studios; this.contentUrl = contentUrl }

  async list(spaceId: string) {
    return (await this.db.query<ShareRow>('SELECT * FROM shares WHERE space_id = $1 AND revoked_at IS NULL ORDER BY created_at DESC', [spaceId])).rows.map(row => view(row, this.contentUrl))
  }

  /** Records the share at once; the snapshot is made in the owner's Studio in the background. */
  async create(spaceId: string, user: CloudUser, document: unknown, title: unknown) {
    const dir = requireText(document, 'document-invalid', 200)
    if (/[/\\\0]/.test(dir) || dir.startsWith('.')) throw new CloudError(400, 'document-invalid')
    const row = (await this.db.query<ShareRow>(`INSERT INTO shares (id, slug, space_id, user_id, document, title, state) VALUES ($1, $2, $3, $4, $5, $6, 'pending') RETURNING *`,
      [randomUUID(), slugOf(), spaceId, user.id, dir, requireText(title ?? dir, 'document-invalid', 200)])).rows[0]!
    void this.#snapshot(row).catch(async error => {
      const code = error instanceof CloudError ? error.code : 'share-failed'
      process.stderr.write(`share ${row.id}: ${error instanceof Error ? error.message : String(error)}\n`)
      await this.db.query(`UPDATE shares SET state = 'failed', error_code = $2, updated_at = now() WHERE id = $1`, [row.id, code]).catch(() => {})
    })
    return view(row, this.contentUrl)
  }

  async #snapshot(row: ShareRow): Promise<void> {
    const connection = await this.studios.running(row.space_id)
    const made = await (await this.studios.control(connection, `/snapshots?${new URLSearchParams({ document: row.document, base: `/p/${row.slug}/` })}`, { method: 'POST', timeoutMs: 20 * 60_000 })).json() as { id: string }
    if (!/^[a-f0-9]{32}$/.test(made.id)) throw new CloudError(502, 'studio-control-failed')
    const prefix = `shares/${row.id}/`
    const source = await body(await this.studios.control(connection, `/snapshots/${made.id}/source`, { timeoutMs: 5 * 60_000 }), SOURCE_LIMIT)
    await this.storage.put(`${prefix}source.tar.gz`, source, 'application/gzip')
    const site = await files(await this.studios.control(connection, `/snapshots/${made.id}/site`, { timeoutMs: 5 * 60_000 }))
    if (!site.has('index.html')) throw new CloudError(502, 'share-site-missing')
    const entries = [...site]
    for (let at = 0; at < entries.length; at += 8) {
      await Promise.all(entries.slice(at, at + 8).map(([path, bytes]) => this.storage.put(`${prefix}site/${path}`, bytes, contentType(path.split('/').at(-1)!) || 'application/octet-stream')))
    }
    await this.db.query(`UPDATE shares SET state = 'ready', error_code = NULL, updated_at = now() WHERE id = $1`, [row.id])
  }

  async revoke(spaceId: string, id: string): Promise<void> {
    const row = (await this.db.query<ShareRow>('UPDATE shares SET revoked_at = now() WHERE id = $1 AND space_id = $2 AND revoked_at IS NULL RETURNING *', [requireId(id), spaceId])).rows[0]
    if (row) await this.storage.removePrefix(`shares/${row.id}/`).catch(error => process.stderr.write(`share ${row.id} cleanup: ${error instanceof Error ? error.message : String(error)}\n`))
  }

  async #shared(slug: string): Promise<ShareRow> {
    if (!validSlug(slug)) throw new CloudError(404, 'share-not-found')
    const row = (await this.db.query<ShareRow>(`SELECT h.*, u.name AS owner_name FROM shares h JOIN users u ON u.id = h.user_id WHERE h.slug = $1 AND h.revoked_at IS NULL`, [slug])).rows[0]
    if (!row) throw new CloudError(404, 'share-not-found')
    return row
  }

  /** What anyone with the link sees. */
  async describe(slug: string) {
    const row = await this.#shared(slug)
    return { slug: row.slug, title: row.title, owner: row.owner_name ?? '', state: row.state, createdAt: row.created_at.toISOString(), siteUrl: new URL(`/p/${row.slug}/`, this.contentUrl).href }
  }

  /** Copies the shared source into the signed-in user's own Studio as a new document, committed there. */
  async fork(slug: string, spaceId: string): Promise<{ document: string, id: string }> {
    const row = await this.#shared(slug)
    if (row.state !== 'ready') throw new CloudError(409, 'share-not-ready')
    const source = await this.storage.get(`shares/${row.id}/source.tar.gz`)
    if (!source) throw new CloudError(404, 'share-not-found')
    const connection = await this.studios.running(spaceId)
    const answer = await (await this.studios.control(connection, `/imports?${new URLSearchParams({ title: row.title })}`, { method: 'POST', body: source.body as unknown as BodyInit, headers: { 'content-type': 'application/gzip' }, timeoutMs: 5 * 60_000 })).json() as { document: string, id: string }
    if (typeof answer.document !== 'string' || typeof answer.id !== 'string') throw new CloudError(502, 'studio-control-failed')
    return answer
  }

  /** The shared site on the content origin: plain files, no cookies, no scripts from the console. */
  routes(app: Hono, contentHost: string): void {
    app.get('/p/:slug/*', async c => {
      if (c.req.header('host')?.toLowerCase() !== contentHost) return c.text('Not found', 404)
      const slug = c.req.param('slug')
      const row = await this.#shared(slug).catch(() => undefined)
      if (!row || row.state !== 'ready') return c.text('Not found', 404)
      let path = decodeURIComponent(new URL(c.req.url).pathname.slice(`/p/${slug}/`.length))
      if (!path || path.endsWith('/')) path += 'index.html'
      if (path.split('/').some(part => !part || part === '.' || part === '..')) return c.text('Not found', 404)
      const object = await this.storage.get(`shares/${row.id}/site/${path}`) ?? (path.includes('.') ? undefined : await this.storage.get(`shares/${row.id}/site/${path}/index.html`))
      if (!object) return c.text('Not found', 404)
      return new Response(object.body, { headers: { 'Content-Type': object.contentType, 'Cache-Control': 'public, max-age=60', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' } })
    })
  }
}
