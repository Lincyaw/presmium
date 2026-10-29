import { createHash, randomBytes } from 'node:crypto'
import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import type { Hono } from 'hono'
import { getCookie, setCookie } from 'hono/cookie'
import { CloudError, requireId } from '../domain/errors.ts'
import type { AuthService } from './auth.ts'
import type { Database, Sql } from './database.ts'
import type { EnvironmentView, RuntimeContext } from './environments.ts'
import { nodeRequest } from './runtime-http.ts'
import type { RuntimeClient } from './runtime-http.ts'
import type { Spaces } from './spaces.ts'

export interface RuntimeAccessDependencies {
  db: Database
  auth: AuthService
  spaces: Spaces
  runtime: RuntimeClient
  publicUrl: string
  runtimeUrl: string
}

interface RuntimeAccessRow {
  id_hash: string
  user_id: string
  workspace_id: string
  environment_id: string
  billing_account_id: string
  generation: number
  expires_at: Date
  author_session_hash?: string | null
}

interface EnvironmentAccessRow {
  id: string
  workspace_id: string
  user_id: string
  billing_account_id: string
  generation: number
  run_deadline: Date
}

const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const secret = () => randomBytes(32).toString('base64url')
const validSecret = (value: string | undefined): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value)
const prefixOf = (spaceId: string, environmentId: string) => `/runtime/spaces/${spaceId}/environments/${environmentId}/`
const ids = (spaceId: string, environmentId: string) => ({ spaceId: requireId(spaceId).toLowerCase(), environmentId: requireId(environmentId).toLowerCase() })
const loopback = (url: URL) => ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.hostname.endsWith('.localhost')

function cookie(request: Request, name: string): string | undefined {
  const found = (request.headers.get('cookie') ?? '').split(';').map(item => item.trim()).find(item => item.startsWith(`${name}=`))
  if (!found) return undefined
  try { return decodeURIComponent(found.slice(name.length + 1)) } catch { return undefined }
}

/** Exchanges a one-use author grant for an environment-only session on the runtime origin. */
export function registerRuntimeAccess(app: Hono, deps: RuntimeAccessDependencies) {
  const { db, auth, spaces, runtime } = deps
  const publicUrl = new URL(deps.publicUrl), runtimeUrl = new URL(deps.runtimeUrl)
  if (runtimeUrl.origin === publicUrl.origin || runtimeUrl.username || runtimeUrl.password || runtimeUrl.pathname !== '/' || runtimeUrl.search || runtimeUrl.hash
    || !(runtimeUrl.protocol === 'https:' || runtimeUrl.protocol === 'http:' && publicUrl.protocol === 'http:' && loopback(runtimeUrl) && loopback(publicUrl))) throw new CloudError(500, 'runtime-origin-invalid')
  const secure = runtimeUrl.protocol === 'https:'
  const cookieName = (environmentId: string) => `${secure ? '__Secure-' : ''}pm-runtime-${environmentId}`
  const sockets = new Set<Duplex>()
  let closed = false

  const runtimeHost = (request: Request): void => {
    const given = request.headers.get('host')
    if (!given || given.toLowerCase() !== runtimeUrl.host.toLowerCase()) throw new CloudError(403, 'runtime-origin-invalid')
    if (closed) throw new CloudError(503, 'runtime-unavailable')
  }

  const currentEnvironment = async (context: RuntimeContext, environmentId: string, generation?: number) => {
    const environment = await runtime.call<EnvironmentView>('environments', { context, action: 'get', environmentId })
    if (environment.id !== environmentId || environment.workspaceId !== context.workspaceId || environment.userId !== context.userId
      || environment.state !== 'running' || !Number.isSafeInteger(environment.generation) || environment.generation < 1
      || generation !== undefined && environment.generation !== generation
      || !environment.runDeadline || !Number.isFinite(Date.parse(environment.runDeadline)) || Date.parse(environment.runDeadline) <= Date.now()) throw new CloudError(409, 'runtime-environment-not-running')
    return environment
  }

  const lockedEnvironment = async (sql: Sql, context: RuntimeContext, environmentId: string, generation: number): Promise<EnvironmentAccessRow> => {
    const found = await sql.query<EnvironmentAccessRow>(`SELECT id, workspace_id, user_id, billing_account_id, generation, run_deadline
      FROM cloud_environments WHERE id = $1 AND workspace_id = $2 AND user_id = $3 AND billing_account_id = $4
        AND generation = $5 AND state = 'running' AND desired_state = 'running' AND run_deadline > now() FOR SHARE`,
    [environmentId, context.workspaceId, context.userId, context.billingAccountId, generation])
    if (!found.rows[0]) throw new CloudError(409, 'runtime-environment-not-running')
    return found.rows[0]
  }

  const authorization = async (request: Request, spaceId: string, environmentId: string) => {
    runtimeHost(request)
    const value = cookie(request, cookieName(environmentId))
    if (!validSecret(value)) throw new CloudError(401, 'runtime-session-required')
    const found = await db.query<RuntimeAccessRow>(`SELECT r.* FROM cloud_runtime_sessions r LEFT JOIN sessions s ON s.id_hash=r.author_session_hash
      WHERE r.id_hash = $1 AND r.workspace_id = $2 AND r.environment_id = $3 AND r.expires_at > now()
        AND (r.author_session_hash IS NULL OR s.expires_at>now())`, [hash(value), spaceId, environmentId])
    const saved = found.rows[0]
    if (!saved) throw new CloudError(401, 'runtime-session-required')
    const membership = await spaces.authorize(saved.user_id, spaceId, 'execute')
    if (membership.billingAccountId !== saved.billing_account_id) throw new CloudError(403, 'runtime-unauthorized')
    const context = { workspaceId: spaceId, userId: saved.user_id, billingAccountId: saved.billing_account_id }
    await currentEnvironment(context, environmentId, saved.generation)
    return { context, session: saved }
  }

  app.use('/runtime/*', async (c, next) => {
    c.header('Cache-Control', 'no-store')
    c.header('Referrer-Policy', 'no-referrer')
    runtimeHost(c.req.raw)
    await next()
  })

  app.get('/api/spaces/:sid/environments/:eid/open', async c => {
    if (closed) throw new CloudError(503, 'runtime-unavailable')
    if (c.req.header('host')?.toLowerCase() !== publicUrl.host.toLowerCase()) throw new CloudError(403, 'runtime-origin-invalid')
    const { spaceId, environmentId } = ids(c.req.param('sid'), c.req.param('eid'))
    const user = await auth.requireUser(c.req.raw)
    const membership = await spaces.authorize(user.id, spaceId, 'execute')
    const context = { workspaceId: spaceId, userId: user.id, billingAccountId: membership.billingAccountId }
    const environment = await currentEnvironment(context, environmentId)
    const ticket = secret()
    await db.transaction(async sql => {
      const member = await spaces.authorize(user.id, spaceId, 'execute', sql)
      if (member.billingAccountId !== context.billingAccountId) throw new CloudError(409, 'runtime-environment-not-running')
      const active = await lockedEnvironment(sql, context, environmentId, environment.generation)
      await sql.query('DELETE FROM cloud_runtime_tickets WHERE expires_at <= now()')
      await sql.query(`INSERT INTO cloud_runtime_tickets (id_hash, user_id, workspace_id, environment_id, billing_account_id, generation, expires_at, author_session_hash)
        VALUES ($1, $2, $3, $4, $5, $6, LEAST($7, now() + interval '60 seconds'), $8)`, [hash(ticket), user.id, spaceId, environmentId, context.billingAccountId, environment.generation, active.run_deadline, auth.sessionHash(c.req.raw) ?? null])
    })
    const target = new URL(`${prefixOf(spaceId, environmentId)}connect`, runtimeUrl)
    target.searchParams.set('ticket', ticket)
    c.header('Cache-Control', 'no-store')
    c.header('Referrer-Policy', 'no-referrer')
    return c.redirect(target.href, 303)
  })

  app.get('/runtime/spaces/:sid/environments/:eid/connect', async c => {
    runtimeHost(c.req.raw)
    const { spaceId, environmentId } = ids(c.req.param('sid'), c.req.param('eid'))
    const ticket = c.req.query('ticket')
    if (!validSecret(ticket)) throw new CloudError(401, 'runtime-ticket-invalid')
    const token = secret()
    const previous = getCookie(c, cookieName(environmentId))
    const saved = await db.transaction(async sql => {
      const found = await sql.query<RuntimeAccessRow>(`DELETE FROM cloud_runtime_tickets
        WHERE id_hash = $1 AND workspace_id = $2 AND environment_id = $3 AND expires_at > now() RETURNING *`, [hash(ticket), spaceId, environmentId])
      const grant = found.rows[0]
      if (!grant) throw new CloudError(401, 'runtime-ticket-invalid')
      const member = await spaces.authorize(grant.user_id, spaceId, 'execute', sql)
      if (member.billingAccountId !== grant.billing_account_id) throw new CloudError(403, 'runtime-unauthorized')
      const context = { workspaceId: spaceId, userId: grant.user_id, billingAccountId: grant.billing_account_id }
      const active = await lockedEnvironment(sql, context, environmentId, grant.generation)
      await sql.query('DELETE FROM cloud_runtime_sessions WHERE expires_at <= now()')
      if (validSecret(previous)) await sql.query('DELETE FROM cloud_runtime_sessions WHERE id_hash = $1 AND environment_id = $2', [hash(previous), environmentId])
      const result = await sql.query<RuntimeAccessRow>(`INSERT INTO cloud_runtime_sessions
          (id_hash, user_id, workspace_id, environment_id, billing_account_id, generation, expires_at, author_session_hash)
        VALUES ($1, $2, $3, $4, $5, $6, LEAST($7, now() + interval '1 hour'), $8) RETURNING *`,
      [hash(token), grant.user_id, spaceId, environmentId, grant.billing_account_id, grant.generation, active.run_deadline, grant.author_session_hash ?? null])
      return result.rows[0]!
    })
    setCookie(c, cookieName(environmentId), token, { httpOnly: true, secure, sameSite: 'Lax', path: prefixOf(spaceId, environmentId), maxAge: Math.max(0, Math.floor((saved.expires_at.getTime() - Date.now()) / 1000)) })
    c.header('Cache-Control', 'no-store')
    c.header('Referrer-Policy', 'no-referrer')
    return c.redirect(`${prefixOf(spaceId, environmentId)}proxy/lab`, 303)
  })

  app.all('/runtime/spaces/:sid/environments/:eid/proxy/*', async c => {
    const { spaceId, environmentId } = ids(c.req.param('sid'), c.req.param('eid'))
    const { context, session } = await authorization(c.req.raw, spaceId, environmentId)
    if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method) && c.req.header('origin') !== runtimeUrl.origin) throw new CloudError(403, 'auth-csrf-invalid')
    const prefix = `${prefixOf(spaceId, environmentId)}proxy/`
    const rest = new URL(c.req.url).pathname.slice(prefix.length)
    const response = await runtime.proxy(c.req.raw, context, environmentId, rest, session.generation)
    response.headers.set('Cache-Control', 'no-store')
    response.headers.set('Referrer-Policy', 'no-referrer')
    return response
  })

  return {
    async upgrade(request: IncomingMessage, socket: Duplex, head: Buffer): Promise<boolean> {
      const url = new URL(request.url ?? '/', runtimeUrl)
      const match = /^\/runtime\/spaces\/([a-f0-9-]+)\/environments\/([a-f0-9-]+)\/proxy\/(.*)$/i.exec(url.pathname)
      if (!match) return false
      try {
        if (request.headers.origin !== runtimeUrl.origin) throw new CloudError(403, 'runtime-origin-invalid')
        const { spaceId, environmentId } = ids(match[1]!, match[2]!)
        const web = nodeRequest(request, runtimeUrl.origin)
        const own = await authorization(web, spaceId, environmentId)
        sockets.add(socket)
        socket.once('close', () => sockets.delete(socket))
        await runtime.upgrade(request, socket, head, own.context, environmentId, match[3]!, async () => {
          // Read the persisted session and membership afresh; author auth caches are not involved.
          const latest = await authorization(nodeRequest(request, runtimeUrl.origin), spaceId, environmentId)
          if (latest.session.generation !== own.session.generation || latest.session.id_hash !== own.session.id_hash) throw new CloudError(409, 'runtime-generation-changed')
        }, own.session.generation)
      } catch (error) {
        const status = error instanceof CloudError && error.status < 500 ? error.status : 503
        if (!socket.destroyed) socket.end(`HTTP/1.1 ${status} Runtime access refused\r\nConnection: close\r\nCache-Control: no-store\r\nContent-Length: 0\r\n\r\n`)
      }
      return true
    },
    async close(): Promise<void> {
      closed = true
      for (const socket of sockets) socket.destroy()
      sockets.clear()
    },
  }
}
