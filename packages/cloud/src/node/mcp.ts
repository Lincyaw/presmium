import { createHash, randomBytes, randomUUID } from 'node:crypto'
import type { Hono } from 'hono'
import { CloudError, requireId, requireText } from '../domain/errors.ts'
import type { Database } from './database.ts'
import type { CloudUser } from './auth.ts'
import type { Hub } from './hub.ts'

/**
 * External agents (Claude Code, Codex) reach the same MCP server Studio's own assistant uses: the workspace
 * service's `/mcp` in the owner's Studio, which this relay starts when needed. A token belongs to one user.
 */
const PREFIX = 'pmc_'
const hash = (value: string) => createHash('sha256').update(value).digest('hex')

interface TokenRow { id: string, name: string, created_at: Date, expires_at: Date | null, last_used_at: Date | null }
const view = (row: TokenRow) => ({ id: row.id, name: row.name, createdAt: row.created_at.toISOString(), expiresAt: row.expires_at?.toISOString() ?? null, lastUsedAt: row.last_used_at?.toISOString() ?? null })

export class AccessTokens {
  readonly db: Database
  constructor(db: Database) { this.db = db }
  async list(user: CloudUser) {
    return (await this.db.query<TokenRow>('SELECT id, name, created_at, expires_at, last_used_at FROM access_tokens WHERE user_id = $1 AND revoked_at IS NULL ORDER BY created_at DESC', [user.id])).rows.map(view)
  }
  async create(user: CloudUser, body: { name?: unknown, days?: unknown }) {
    const name = requireText(body.name, 'token-name-invalid', 80)
    const days = body.days === undefined || body.days === null ? null : Number(body.days)
    if (days !== null && (!Number.isSafeInteger(days) || days < 1 || days > 366)) throw new CloudError(400, 'token-expiry-invalid')
    const secret = `${PREFIX}${randomBytes(32).toString('base64url')}`
    const row = (await this.db.query<TokenRow>(`INSERT INTO access_tokens (id, user_id, name, token_hash, expires_at) VALUES ($1, $2, $3, $4, CASE WHEN $5::integer IS NULL THEN NULL ELSE now() + $5 * interval '1 day' END)
      RETURNING id, name, created_at, expires_at, last_used_at`, [randomUUID(), user.id, name, hash(secret), days])).rows[0]!
    return { ...view(row), secret }
  }
  async revoke(user: CloudUser, id: string) {
    await this.db.query('UPDATE access_tokens SET revoked_at = now() WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL', [requireId(id), user.id])
  }
  /** The user a live token belongs to. */
  async user(secret: string): Promise<CloudUser> {
    if (!secret.startsWith(PREFIX) || secret.length > 200) throw new CloudError(401, 'auth-token-invalid')
    const row = (await this.db.query<{ id: string, issuer: string, subject: string, name: string, email: string | null, email_verified: boolean }>(`UPDATE access_tokens t SET last_used_at = now() FROM users u
      WHERE t.token_hash = $1 AND t.revoked_at IS NULL AND (t.expires_at IS NULL OR t.expires_at > now()) AND u.id = t.user_id
      RETURNING u.id, u.issuer, u.subject, u.name, u.email, u.email_verified`, [hash(secret)])).rows[0]
    if (!row) throw new CloudError(401, 'auth-token-invalid')
    return { id: row.id, issuer: row.issuer, subject: row.subject, name: row.name, ...row.email ? { email: row.email } : {}, emailVerified: row.email_verified }
  }
}

const PASSED = ['accept', 'content-type', 'mcp-session-id', 'mcp-protocol-version', 'last-event-id']
const RETURNED = ['content-type', 'mcp-session-id', 'cache-control']

export function registerMcp(app: Hono, deps: { tokens: AccessTokens, hub: Hub, publicUrl: string }) {
  const publicUrl = new URL(deps.publicUrl)
  app.all('/mcp', async c => {
    try {
      const request = c.req.raw
      if (request.headers.has('origin') && request.headers.get('origin') !== publicUrl.origin) throw new CloudError(403, 'mcp-origin-invalid')
      const matched = /^Bearer (\S+)$/i.exec(request.headers.get('authorization') ?? '')
      if (!matched) throw new CloudError(401, 'auth-required')
      const name = deps.hub.name(await deps.tokens.user(matched[1]!))
      await deps.hub.running(name)
      const headers: Record<string, string> = {}
      for (const header of PASSED) { const value = request.headers.get(header); if (value !== null) headers[header] = value }
      const upstream = await deps.hub.control(name, '/mcp', { method: request.method, headers, ...['GET', 'HEAD'].includes(request.method) ? {} : { body: request.body }, signal: request.signal })
      const answered = new Headers()
      for (const header of RETURNED) { const value = upstream.headers.get(header); if (value !== null) answered.set(header, value) }
      return new Response(upstream.body, { status: upstream.status, headers: answered })
    } catch (error) {
      const known = error instanceof CloudError ? error : new CloudError(503, 'service-unavailable')
      return c.json({ error: known.code }, known.status as 400, { 'Cache-Control': 'no-store' })
    }
  })
}
