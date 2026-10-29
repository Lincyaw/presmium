import { createHash, randomBytes, randomUUID } from 'node:crypto'
import type { Hono } from 'hono'
import { CloudError, requireId, requireText } from '../domain/errors.ts'
import type { Database } from './database.ts'
import type { Gateway } from './gateway.ts'
import type { Studios } from './studios.ts'

/**
 * External agents (Claude Code, Codex) reach the same MCP server Studio's own assistant uses: the workspace
 * service's `/mcp` in the owner's Studio, which this relay starts when needed. A token belongs to one space.
 */
const PREFIX = 'pmc_'
const hash = (value: string) => createHash('sha256').update(value).digest('hex')

interface TokenRow { id: string, name: string, created_at: Date, expires_at: Date | null, last_used_at: Date | null }
const view = (row: TokenRow) => ({ id: row.id, name: row.name, createdAt: row.created_at.toISOString(), expiresAt: row.expires_at?.toISOString() ?? null, lastUsedAt: row.last_used_at?.toISOString() ?? null })

export class AccessTokens {
  readonly db: Database
  constructor(db: Database) { this.db = db }
  async list(spaceId: string) {
    return (await this.db.query<TokenRow>('SELECT id, name, created_at, expires_at, last_used_at FROM access_tokens WHERE space_id = $1 AND revoked_at IS NULL ORDER BY created_at DESC', [spaceId])).rows.map(view)
  }
  async create(spaceId: string, userId: string, body: { name?: unknown, days?: unknown }) {
    const name = requireText(body.name, 'token-name-invalid', 80)
    const days = body.days === undefined || body.days === null ? null : Number(body.days)
    if (days !== null && (!Number.isSafeInteger(days) || days < 1 || days > 366)) throw new CloudError(400, 'token-expiry-invalid')
    const secret = `${PREFIX}${randomBytes(32).toString('base64url')}`
    const row = (await this.db.query<TokenRow>(`INSERT INTO access_tokens (id, space_id, user_id, name, token_hash, expires_at) VALUES ($1, $2, $3, $4, $5, CASE WHEN $6::integer IS NULL THEN NULL ELSE now() + $6 * interval '1 day' END)
      RETURNING id, name, created_at, expires_at, last_used_at`, [randomUUID(), spaceId, userId, name, hash(secret), days])).rows[0]!
    return { ...view(row), secret }
  }
  async revoke(spaceId: string, id: string) {
    await this.db.query('UPDATE access_tokens SET revoked_at = now() WHERE id = $1 AND space_id = $2 AND revoked_at IS NULL', [requireId(id), spaceId])
  }
  /** The space a live token belongs to; its owner must still own the space. */
  async space(secret: string): Promise<string> {
    if (!secret.startsWith(PREFIX) || secret.length > 200) throw new CloudError(401, 'auth-token-invalid')
    const row = (await this.db.query<{ space_id: string }>(`UPDATE access_tokens t SET last_used_at = now() FROM spaces s
      WHERE t.token_hash = $1 AND t.revoked_at IS NULL AND (t.expires_at IS NULL OR t.expires_at > now()) AND s.id = t.space_id AND s.owner_id = t.user_id
      RETURNING t.space_id`, [hash(secret)])).rows[0]
    if (!row) throw new CloudError(401, 'auth-token-invalid')
    return row.space_id
  }
}

const PASSED = ['accept', 'content-type', 'mcp-session-id', 'mcp-protocol-version', 'last-event-id']
const RETURNED = ['content-type', 'mcp-session-id', 'cache-control']

export function registerMcp(app: Hono, deps: { tokens: AccessTokens, studios: Studios, gateway: Gateway, publicUrl: string }) {
  const publicUrl = new URL(deps.publicUrl)
  app.all('/mcp', async c => {
    try {
      const request = c.req.raw
      if (request.headers.has('origin') && request.headers.get('origin') !== publicUrl.origin) throw new CloudError(403, 'mcp-origin-invalid')
      const matched = /^Bearer (\S+)$/i.exec(request.headers.get('authorization') ?? '')
      if (!matched) throw new CloudError(401, 'auth-required')
      const spaceId = await deps.tokens.space(matched[1]!)
      const connection = await deps.studios.running(spaceId, 180_000)
      const ready = await deps.gateway.ready(spaceId, connection)
      void deps.studios.touch(spaceId).catch(() => {})
      const headers: Record<string, string> = { authorization: `Bearer ${ready.mcp.token}` }
      for (const name of PASSED) { const value = request.headers.get(name); if (value !== null) headers[name] = value }
      const upstream = await fetch(ready.mcp.url, { method: request.method, headers, ...['GET', 'HEAD'].includes(request.method) ? {} : { body: request.body, duplex: 'half' }, redirect: 'error', signal: request.signal } as RequestInit)
      const answered = new Headers()
      for (const name of RETURNED) { const value = upstream.headers.get(name); if (value !== null) answered.set(name, value) }
      return new Response(upstream.body, { status: upstream.status, headers: answered })
    } catch (error) {
      const known = error instanceof CloudError ? error : new CloudError(503, 'service-unavailable')
      return c.json({ error: known.code }, known.status as 400, { 'Cache-Control': 'no-store' })
    }
  })
}
