import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import type { Context, Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { createRemoteJWKSet, customFetch as joseFetch, jwtVerify } from 'jose'
import * as oidc from 'openid-client'
import { CloudError } from '../domain/errors.ts'
import type { Database } from './database.ts'

export interface CloudUser {
  id: string
  issuer: string
  subject: string
  email?: string
  name: string
  emailVerified: boolean
}

export interface AuthConfig {
  issuer: string
  clientId: string
  clientSecret?: string
  audience: string
  publicUrl: string
  /** Explicit private-network route for an otherwise unchanged public issuer. */
  issuerInternalUrl?: string
  allowInsecureLoopback?: boolean
  sessionTtlSeconds?: number
}

interface UserRow {
  id: string
  issuer: string
  subject: string
  email: string | null
  name: string
  email_verified: boolean
}

interface FlowRow {
  verifier: string
  nonce: string
  state: string
  returnTo: string
  expectedSubject: string | null
}

export interface AuthService {
  /** Server-only binding for environment grants; never expose this value to browser code. */
  sessionHash(request: Request): string | undefined
  user(request: Request): Promise<CloudUser | undefined>
  requireUser(request: Request): Promise<CloudUser>
  assertCsrf(request: Request): Promise<void>
  metadata(resource?: string): Record<string, unknown>
  routes(app: Hono): void
}

const digest = (value: string) => createHash('sha256').update(value).digest('hex')
const random = () => randomBytes(32).toString('base64url')
const equal = (left: string, right: string) => { const a = Buffer.from(left), b = Buffer.from(right); return a.length === b.length && timingSafeEqual(a, b) }
const loopback = (url: URL) => ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.hostname.endsWith('.localhost')
const member = (row: UserRow): CloudUser => ({ id: row.id, issuer: row.issuer, subject: row.subject, ...row.email ? { email: row.email } : {}, name: row.name, emailVerified: row.email_verified })

function cookies(request: Request): Record<string, string> {
  return Object.fromEntries((request.headers.get('cookie') ?? '').split(';').flatMap(value => {
    const at = value.indexOf('=')
    if (at < 0) return []
    try { return [[value.slice(0, at).trim(), decodeURIComponent(value.slice(at + 1).trim())]] }
    catch { return [] }
  }))
}

function endpoint(value: string, allowLoopback: boolean): URL {
  const url = new URL(value)
  if (url.username || url.password || url.hash || url.search || (url.protocol !== 'https:' && !(allowLoopback && url.protocol === 'http:' && loopback(url)))) throw new CloudError(500, 'auth-configuration-invalid')
  return url
}

/** Login may return only to a concrete application route, never an arbitrary URL. */
export function authenticationReturnPath(value: unknown): string {
  if (typeof value !== 'string' || value.length > 512) return '/'
  return value === '/' || /^\/s\/[A-Za-z0-9_-]{22}$/.test(value) ? value : '/'
}

/** OIDC owns credentials; this service owns only opaque, revocable application sessions. */
export async function createAuthService(db: Database, config: AuthConfig): Promise<AuthService> {
  const publicUrl = endpoint(config.publicUrl, config.allowInsecureLoopback === true)
  const issuer = endpoint(config.issuer, config.allowInsecureLoopback === true)
  if (!config.clientId || !config.audience) throw new CloudError(500, 'auth-configuration-invalid')
  const internal = config.issuerInternalUrl ? new URL(config.issuerInternalUrl) : undefined
  if (internal && (internal.username || internal.password || internal.search || internal.hash || !['http:', 'https:'].includes(internal.protocol))) throw new CloudError(500, 'auth-configuration-invalid')
  const identityFetch = async (input: string | URL | Request, init?: RequestInit | oidc.CustomFetchOptions): Promise<Response> => {
    const requested = new URL(input instanceof Request ? input.url : input.toString())
    endpoint(requested.origin, config.allowInsecureLoopback === true)
    let target = requested
    if (internal && requested.origin === issuer.origin && (requested.pathname === issuer.pathname || requested.pathname.startsWith(`${issuer.pathname.replace(/\/$/, '')}/`))) {
      target = new URL(internal)
      target.pathname = `${internal.pathname.replace(/\/$/, '')}${requested.pathname.slice(issuer.pathname.replace(/\/$/, '').length)}`
      target.search = requested.search
    }
    const body = init?.body instanceof Uint8Array ? new Uint8Array(init.body).buffer : init?.body
    return fetch(target, { ...init, body, redirect: 'error' })
  }
  const configuration = await oidc.discovery(issuer, config.clientId, config.clientSecret, undefined, {
    timeout: 15,
    [oidc.customFetch]: identityFetch,
    ...issuer.protocol === 'http:' ? { execute: [oidc.allowInsecureRequests] } : {},
  })
  const metadata = configuration.serverMetadata()
  if (metadata.issuer !== config.issuer || !metadata.jwks_uri) throw new CloudError(500, 'auth-configuration-invalid')
  endpoint(metadata.jwks_uri, config.allowInsecureLoopback === true)
  const jwks = createRemoteJWKSet(new URL(metadata.jwks_uri), { [joseFetch]: identityFetch, timeoutDuration: 15_000 })
  const secure = publicUrl.protocol === 'https:'
  const sessionCookie = secure ? '__Host-pm-session' : 'pm-session'
  const flowCookie = secure ? '__Host-pm-login' : 'pm-login'
  const cookieOptions = { httpOnly: true, secure, sameSite: 'Lax' as const, path: '/' }
  const ttl = config.sessionTtlSeconds ?? 60 * 60 * 24 * 7
  if (!Number.isSafeInteger(ttl) || ttl < 60 || ttl > 60 * 60 * 24 * 30) throw new CloudError(500, 'auth-configuration-invalid')
  const callbackUrl = new URL('/api/auth/callback', publicUrl).href
  const cache = new WeakMap<Request, Promise<CloudUser | undefined>>()

  const upsert = async (claims: { sub: string, email?: unknown, name?: unknown, preferred_username?: unknown, email_verified?: unknown }) => {
    const email = typeof claims.email === 'string' ? claims.email : null
    const name = typeof claims.name === 'string' ? claims.name : typeof claims.preferred_username === 'string' ? claims.preferred_username : email ?? claims.sub
    const answer = await db.query<UserRow>(`INSERT INTO users (id, issuer, subject, email, name, email_verified)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (issuer, subject) DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name,
        email_verified = EXCLUDED.email_verified, updated_at = now()
      RETURNING id, issuer, subject, email, name, email_verified`, [randomUUID(), config.issuer, claims.sub, email, name, claims.email_verified === true])
    return member(answer.rows[0]!)
  }

  const resolveUser = async (request: Request): Promise<CloudUser | undefined> => {
    const authorization = request.headers.get('authorization')
    if (authorization !== null) {
      const matched = /^Bearer ([^\s]+)$/i.exec(authorization)
      if (!matched || matched[1]!.length > 32_768) throw new CloudError(401, 'auth-token-invalid')
      try {
        const { payload, protectedHeader } = await jwtVerify(matched[1]!, jwks, { issuer: config.issuer, audience: config.audience, requiredClaims: ['sub', 'exp', 'iat'], algorithms: ['RS256', 'PS256', 'ES256', 'EdDSA'] })
        // An ID token for the login client must not become an API access token.
        if (typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 1000 || payload.nonce !== undefined || !(payload.typ === 'Bearer' || protectedHeader.typ === 'at+jwt' || protectedHeader.typ === 'application/at+jwt')) throw new CloudError(401, 'auth-token-invalid')
        return upsert({ ...payload, sub: payload.sub! })
      } catch (error) {
        if (error instanceof CloudError) throw error
        throw new CloudError(401, 'auth-token-invalid')
      }
    }
    const token = cookies(request)[sessionCookie]
    if (!token || token.length > 256) return undefined
    const answer = await db.query<UserRow>(`SELECT u.id, u.issuer, u.subject, u.email, u.name, u.email_verified
      FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id_hash = $1 AND s.expires_at > now()`, [digest(token)])
    return answer.rows[0] ? member(answer.rows[0]) : undefined
  }

  const service: AuthService = {
    sessionHash(request) { const token = cookies(request)[sessionCookie]; return token && token.length <= 256 ? digest(token) : undefined },
    user(request) {
      let result = cache.get(request)
      if (!result) { result = resolveUser(request); cache.set(request, result) }
      return result
    },
    async requireUser(request) {
      const user = await service.user(request)
      if (!user) throw new CloudError(401, 'auth-required')
      return user
    },
    async assertCsrf(request) {
      await service.requireUser(request)
      if (request.headers.has('authorization')) return
      const token = cookies(request)[sessionCookie]
      const given = request.headers.get('x-csrf-token') ?? ''
      if (request.headers.get('origin') !== publicUrl.origin || !token || !equal(given, digest(`csrf:${token}`))) throw new CloudError(403, 'auth-csrf-invalid')
    },
    metadata(resource = new URL('/mcp', publicUrl).href) {
      return { resource, authorization_servers: [config.issuer], bearer_methods_supported: ['header'], scopes_supported: ['openid'] }
    },
    routes(app) {
      const begin = async (c: Context, register: boolean, verificationUser?: CloudUser) => {
        const browser = random(), state = oidc.randomState(), nonce = oidc.randomNonce(), verifier = oidc.randomPKCECodeVerifier()
        const challenge = await oidc.calculatePKCECodeChallenge(verifier)
        await db.query(`DELETE FROM oidc_flows WHERE expires_at <= now()`)
        await db.query(`INSERT INTO oidc_flows (id_hash, browser_hash, verifier, nonce, state, expires_at, return_to, expected_subject)
          VALUES ($1, $2, $3, $4, $5, now() + interval '10 minutes', $6, $7)`, [digest(state), digest(browser), verifier, nonce, state, authenticationReturnPath(c.req.query('returnTo')), verificationUser?.subject ?? null])
        setCookie(c, flowCookie, browser, { ...cookieOptions, maxAge: 600 })
        c.header('Cache-Control', 'no-store')
        const locale = c.req.query('locale'), theme = c.req.query('theme')
        return c.redirect(oidc.buildAuthorizationUrl(configuration, { redirect_uri: callbackUrl, scope: 'openid email profile', state, nonce, code_challenge: challenge, code_challenge_method: 'S256',
          ...locale === 'zh-CN' || locale === 'en' ? { ui_locales: locale } : {},
          ...theme === 'light' || theme === 'dark' ? { ui_theme: theme } : {},
          ...verificationUser ? { kc_action: 'VERIFY_EMAIL' } : {},
          ...register ? { prompt: 'create' } : {} }).href)
      }
      app.get('/api/auth/login', c => begin(c, false))
      app.get('/api/auth/register', c => begin(c, true))
      app.get('/api/auth/verify-email', async c => begin(c, false, await service.requireUser(c.req.raw)))
      app.get('/api/auth/callback', async c => {
        c.header('Cache-Control', 'no-store')
        const state = c.req.query('state'), browser = getCookie(c, flowCookie)
        if (!state || state.length > 256 || !browser || browser.length > 256) throw new CloudError(400, 'auth-flow-invalid')
        // DELETE ... RETURNING consumes the flow atomically across replicas and restarts.
        const flow = await db.query<FlowRow>(`DELETE FROM oidc_flows WHERE id_hash = $1 AND browser_hash = $2 AND expires_at > now() RETURNING verifier, nonce, state, return_to AS "returnTo", expected_subject AS "expectedSubject"`, [digest(state), digest(browser)])
        deleteCookie(c, flowCookie, cookieOptions)
        const saved = flow.rows[0]
        if (!saved) throw new CloudError(400, 'auth-flow-invalid')
        const current = new URL(callbackUrl)
        current.search = new URL(c.req.url).search
        let user: CloudUser
        try {
          const tokens = await oidc.authorizationCodeGrant(configuration, current, { pkceCodeVerifier: saved.verifier, expectedState: saved.state, expectedNonce: saved.nonce, idTokenExpected: true })
          const claims = tokens.claims()
          if (!claims?.sub) throw new CloudError(401, 'auth-login-failed')
          if (saved.expectedSubject && claims.sub !== saved.expectedSubject) throw new CloudError(401, 'auth-account-changed')
          user = await upsert(claims)
        } catch { throw new CloudError(401, 'auth-login-failed') }
        const previous = getCookie(c, sessionCookie)
        const token = random()
        await db.transaction(async client => {
          await client.query('DELETE FROM sessions WHERE expires_at <= now()')
          if (previous) await client.query('DELETE FROM sessions WHERE id_hash = $1', [digest(previous)])
          await client.query(`INSERT INTO sessions (id_hash, user_id, expires_at) VALUES ($1, $2, now() + $3 * interval '1 second')`, [digest(token), user.id, ttl])
        })
        setCookie(c, sessionCookie, token, { ...cookieOptions, maxAge: ttl })
        return c.redirect(authenticationReturnPath(saved.returnTo))
      })
      app.get('/api/auth/account', async c => {
        await service.requireUser(c.req.raw)
        c.header('Cache-Control', 'no-store')
        return c.redirect(new URL(`${issuer.pathname.replace(/\/$/, '')}/account/`, issuer.origin).href)
      })
      app.get('/api/auth/session', async c => {
        c.header('Cache-Control', 'no-store')
        const user = await service.user(c.req.raw)
        const token = getCookie(c, sessionCookie)
        return c.json({ user: user ?? null, csrfToken: user && token ? digest(`csrf:${token}`) : null })
      })
      app.post('/api/auth/logout', async c => {
        await service.assertCsrf(c.req.raw)
        const token = getCookie(c, sessionCookie)
        if (token) await db.query('DELETE FROM sessions WHERE id_hash = $1', [digest(token)])
        deleteCookie(c, sessionCookie, cookieOptions)
        c.header('Cache-Control', 'no-store')
        const logoutUrl = metadata.end_session_endpoint ? oidc.buildEndSessionUrl(configuration, { client_id: config.clientId, post_logout_redirect_uri: publicUrl.origin }).href : undefined
        return c.json({ loggedOut: true, ...logoutUrl ? { logoutUrl } : {} })
      })
      app.get('/.well-known/oauth-protected-resource', c => c.json(service.metadata()))
      app.get('/.well-known/oauth-protected-resource/mcp', c => c.json(service.metadata()))
    },
  }
  return service
}

export function authRoutes(app: Hono, service: AuthService): void { service.routes(app) }
