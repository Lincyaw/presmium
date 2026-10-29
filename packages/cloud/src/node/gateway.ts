import { createHash, randomBytes } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Duplex } from 'node:stream'
import { createProxyServer } from 'http-proxy-3'
import { CloudError, requireId } from '../domain/errors.ts'
import type { AuthService, CloudUser } from './auth.ts'
import { studioHost, studioOrigins } from './config.ts'
import type { CloudConfig } from './config.ts'
import type { Database } from './database.ts'
import type { StudioConnection, Studios } from './studios.ts'

/**
 * Each Studio has two hosts: `s-<slug>` (DeepSeek Harness and the workbench) and `p-<slug>` (the workspace service:
 * previews and outputs). The console signs its user in to both with one-use tickets; every request then carries a
 * host-only gate cookie, checked against the owner, the console session and the Studio's generation, and is
 * forwarded unchanged (with its `Host`) to the container. The gate cookie itself never reaches the container.
 */
const CONNECT = '/__presmium_cloud/connect'
const GATE = 'pm-gate'
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const secret = () => randomBytes(32).toString('base64url')
const validSecret = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value)

interface Grant { user_id: string, space_id: string, generation: number, host: 'studio' | 'preview', next: string | null }
interface Allowed { spaceId: string, generation: number, until: number }
interface Ready { token: string, serve: string, mcp: { url: string, token: string } }

function cookie(header: string | undefined, name: string): string | undefined {
  for (const part of (header ?? '').split(';')) {
    const at = part.indexOf('=')
    if (at > 0 && part.slice(0, at).trim() === name) return part.slice(at + 1).trim()
  }
  return undefined
}
const withoutCookie = (header: string | undefined, name: string) => (header ?? '').split(';').filter(part => part.split('=')[0]!.trim() !== name).join(';').trim()

function refuse(response: ServerResponse, status: number, code: string): void {
  if (response.headersSent) { response.destroy(); return }
  response.writeHead(status, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' })
  response.end(code)
}

export class Gateway {
  readonly db: Database
  readonly config: CloudConfig
  readonly studios: Studios
  readonly auth: AuthService
  readonly #proxy = createProxyServer({ xfwd: false, changeOrigin: false, ws: true })
  readonly #allowed = new Map<string, Allowed>()
  readonly #ready = new Map<string, { generation: number, ready: Promise<Ready> }>()
  readonly #sockets = new Map<Duplex, string>()
  readonly #ticker: NodeJS.Timeout
  readonly #secure: boolean

  constructor(db: Database, config: CloudConfig, studios: Studios, auth: AuthService) {
    this.db = db; this.config = config; this.studios = studios; this.auth = auth
    this.#secure = config.studioDomain.scheme === 'https'
    this.#proxy.on('error', (_error: Error, _request: unknown, res: unknown) => {
      const response = res as ServerResponse | Duplex | undefined
      if (response && 'writeHead' in response) refuse(response, 502, 'studio-unavailable')
      else response?.destroy()
    })
    // An open Studio tab or agent stream is activity; idle Studios stop and keep their files.
    this.#ticker = setInterval(() => { for (const space of new Set(this.#sockets.values())) void this.studios.touch(space).catch(() => {}) }, 60_000)
    this.#ticker.unref()
  }

  handles(request: IncomingMessage): boolean { return studioHost(this.config, request.headers.host) !== undefined }

  /** The console's entry: a signed-in owner of a running Studio goes through both hosts' ticket exchanges into Studio. */
  async open(request: Request, user: CloudUser, spaceId: string, target: { document?: string, id?: string }): Promise<string> {
    const connection = await this.studios.connection(spaceId)
    const ready = await this.ready(spaceId, connection)
    const origins = studioOrigins(this.config, connection.slug)
    const fragment = target.document !== undefined && target.id ? `#presmium?${new URLSearchParams({ document: target.document, id: target.id })}` : ''
    const session = this.auth.sessionHash(request) ?? null
    const issue = async (host: 'studio' | 'preview', next: string | null) => {
      const ticket = secret()
      await this.db.query(`INSERT INTO gate_tickets (id_hash, user_id, space_id, generation, host, next, author_session_hash, expires_at) VALUES ($1, $2, $3, $4, $5, $6, $7, now() + interval '60 seconds')`,
        [hash(ticket), user.id, spaceId, connection.generation, host, next, session])
      return ticket
    }
    await this.db.query('DELETE FROM gate_tickets WHERE expires_at <= now()')
    const studio = `${origins.studio}${CONNECT}?ticket=${await issue('studio', `/?token=${encodeURIComponent(ready.token)}${fragment}`)}`
    return `${origins.preview}${CONNECT}?ticket=${await issue('preview', studio)}`
  }

  /** The Studio container's launch token, workspace service and MCP endpoint, once per generation. */
  ready(spaceId: string, connection: StudioConnection): Promise<Ready> {
    const known = this.#ready.get(spaceId)
    if (known?.generation === connection.generation) return known.ready
    const ready = (async () => {
      const answer = await (await this.studios.control(connection, '/ready')).json() as Ready
      const own = new URL(connection.control).hostname
      if (!/^[A-Za-z0-9_-]{16,128}$/.test(answer.token) || new URL(answer.serve).hostname !== own || new URL(answer.mcp.url).hostname !== own) throw new CloudError(502, 'studio-control-failed')
      return answer
    })()
    ready.catch(() => { if (this.#ready.get(spaceId)?.ready === ready) this.#ready.delete(spaceId) })
    this.#ready.set(spaceId, { generation: connection.generation, ready })
    return ready
  }

  async #connect(request: IncomingMessage, response: ServerResponse, kind: 'studio' | 'preview', slug: string, url: URL): Promise<void> {
    const ticket = url.searchParams.get('ticket')
    if (!validSecret(ticket)) return refuse(response, 401, 'studio-ticket-invalid')
    const token = secret()
    const grant = await this.db.transaction(async sql => {
      const found = (await sql.query<Grant & { author_session_hash: string | null }>(`DELETE FROM gate_tickets t USING studios s WHERE t.id_hash = $1 AND t.host = $2 AND t.expires_at > now()
        AND s.space_id = t.space_id AND s.slug = $3 RETURNING t.*`, [hash(ticket), kind, slug])).rows[0]
      if (!found) return undefined
      await sql.query('DELETE FROM gate_sessions WHERE expires_at <= now()')
      await sql.query(`INSERT INTO gate_sessions (id_hash, user_id, space_id, generation, host, author_session_hash, expires_at) VALUES ($1, $2, $3, $4, $5, $6, now() + interval '12 hours')`,
        [hash(token), found.user_id, found.space_id, found.generation, kind, found.author_session_hash])
      return found
    })
    if (!grant) return refuse(response, 401, 'studio-ticket-invalid')
    const origins = studioOrigins(this.config, slug)
    // The preview host passes on to the same Studio's host only; that host goes to its own root.
    const next = grant.next ?? '/'
    if (kind === 'preview' ? !next.startsWith(`${origins.studio}${CONNECT}?`) : !next.startsWith('/') || next.startsWith('//')) return refuse(response, 400, 'studio-ticket-invalid')
    const headers = {
      'set-cookie': `${GATE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200${this.#secure ? '; Secure' : ''}`,
      'cache-control': 'no-store', 'referrer-policy': 'no-referrer',
    }
    if (kind === 'preview') {
      response.writeHead(303, { ...headers, location: next })
      return void response.end()
    }
    // DeepSeek Harness's session cookie is SameSite=Strict: its token exchange must be a navigation this host's own
    // page starts, not the tail of the redirect chain that began on the console.
    const target = JSON.stringify(next).replace(/</g, '\\u003c')
    response.writeHead(200, { ...headers, 'content-type': 'text/html; charset=utf-8', 'content-security-policy': "default-src 'none'; script-src 'sha256-" + createHash('sha256').update(`location.replace(${target})`).digest('base64') + "'" })
    response.end(`<!doctype html><meta charset="utf-8"><title>Presmium</title><script>location.replace(${target})</script>`)
  }

  async #allow(request: IncomingMessage, kind: 'studio' | 'preview', slug: string): Promise<Allowed> {
    const value = cookie(request.headers.cookie, GATE)
    if (!validSecret(value)) throw new CloudError(401, 'studio-session-required')
    const key = `${hash(value)}:${kind}:${slug}`, cached = this.#allowed.get(key)
    if (cached && cached.until > Date.now()) return cached
    const found = (await this.db.query<{ space_id: string, generation: number }>(`SELECT g.space_id, g.generation FROM gate_sessions g
      JOIN spaces p ON p.id = g.space_id AND p.owner_id = g.user_id
      JOIN studios s ON s.space_id = g.space_id AND s.slug = $3 AND s.generation = g.generation AND s.state = 'running' AND s.desired_state = 'running'
      LEFT JOIN sessions a ON a.id_hash = g.author_session_hash
      WHERE g.id_hash = $1 AND g.host = $2 AND g.expires_at > now() AND (g.author_session_hash IS NULL OR a.expires_at > now())`, [hash(value), kind, slug])).rows[0]
    if (!found) { this.#allowed.delete(key); throw new CloudError(401, 'studio-session-required') }
    const allowed = { spaceId: found.space_id, generation: found.generation, until: Date.now() + 10_000 }
    if (this.#allowed.size > 10_000) this.#allowed.clear()
    this.#allowed.set(key, allowed)
    return allowed
  }

  async #target(request: IncomingMessage, kind: 'studio' | 'preview', slug: string): Promise<{ target: string, spaceId: string }> {
    const allowed = await this.#allow(request, kind, slug)
    const connection = await this.studios.connection(allowed.spaceId, allowed.generation)
    void this.studios.touch(allowed.spaceId).catch(() => {})
    // The container sees its own cookies only, never the console's gate.
    const others = withoutCookie(request.headers.cookie, GATE)
    if (others) request.headers.cookie = others
    else delete request.headers.cookie
    return { target: kind === 'studio' ? connection.studio : (await this.ready(allowed.spaceId, connection)).serve, spaceId: allowed.spaceId }
  }

  async web(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const host = studioHost(this.config, request.headers.host)!
    try {
      const url = new URL(request.url ?? '/', 'http://studio')
      if (url.pathname === CONNECT) return await this.#connect(request, response, host.kind, host.slug, url)
      const { target } = await this.#target(request, host.kind, host.slug)
      this.#proxy.web(request, response, { target })
    } catch (error) {
      const status = error instanceof CloudError ? error.status : 502
      if (status === 401 && request.method === 'GET' && host.kind === 'studio' && (request.headers.accept ?? '').includes('text/html')) {
        // An expired or missing gate on a page: sign in again through the console.
        response.writeHead(303, { location: new URL('/api/studio/open', this.config.publicUrl).href, 'cache-control': 'no-store' })
        return void response.end()
      }
      refuse(response, status, error instanceof CloudError ? error.code : 'studio-unavailable')
    }
  }

  async upgrade(request: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
    const host = studioHost(this.config, request.headers.host)!
    try {
      const { target, spaceId } = await this.#target(request, host.kind, host.slug)
      this.#sockets.set(socket, spaceId)
      socket.once('close', () => this.#sockets.delete(socket))
      this.#proxy.ws(request, socket, head, { target })
    } catch (error) {
      const status = error instanceof CloudError && error.status < 500 ? error.status : 502
      if (!socket.destroyed) socket.end(`HTTP/1.1 ${status} Studio refused\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`)
    }
  }

  /** Forget a Studio's cached readiness (after it stops) and the gates of a signed-out session. */
  forget(spaceId: string): void {
    this.#ready.delete(requireId(spaceId))
    for (const [key, allowed] of this.#allowed) if (allowed.spaceId === spaceId) this.#allowed.delete(key)
  }

  close(): void {
    clearInterval(this.#ticker)
    for (const socket of this.#sockets.keys()) socket.destroy()
    this.#proxy.close()
  }
}
