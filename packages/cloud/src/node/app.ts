import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Duplex } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { getRequestListener } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { CloudError } from '../domain/errors.ts'
import { authRoutes, createAuthService } from './auth.ts'
import type { CloudUser } from './auth.ts'
import { studioHost, studioOrigins } from './config.ts'
import type { CloudConfig } from './config.ts'
import { Database } from './database.ts'
import { Gateway } from './gateway.ts'
import { AccessTokens, registerMcp } from './mcp.ts'
import { Shares } from './shares.ts'
import { ObjectStorage } from './storage.ts'
import { Studios } from './studios.ts'

/** The console (login, the Studio, sharing, MCP access), the shared sites, and the gateway to every Studio. */
export async function createCloudApp(config: CloudConfig, database?: Database) {
  const db = database ?? new Database(config.databaseUrl)
  const auth = await createAuthService(db, config.auth)
  const studios = new Studios(db, config.runtime.credentialKey), storage = new ObjectStorage(config.storage)
  const shares = new Shares(db, storage, studios, config.contentUrl), tokens = new AccessTokens(db)
  const gateway = new Gateway(db, config, studios, auth)
  const publicHost = new URL(config.publicUrl).host.toLowerCase(), contentHost = new URL(config.contentUrl).host.toLowerCase()
  // A share whose snapshot was cut off by a restart is failed, not pending forever.
  await db.query(`UPDATE shares SET state = 'failed', error_code = 'share-interrupted', updated_at = now() WHERE state = 'pending' AND updated_at < now() - interval '30 minutes'`)

  const app = new Hono()
  app.onError((error, c) => {
    if (error instanceof CloudError) return c.json({ error: error.code, ...error.details ? { details: error.details } : {} }, error.status as 400)
    process.stderr.write(`cloud request failed: ${error instanceof Error ? error.stack : String(error)}\n`)
    return c.json({ error: 'service-unavailable' }, 503)
  })
  app.use('*', async (c, next) => {
    c.header('X-Content-Type-Options', 'nosniff')
    c.header('Referrer-Policy', 'same-origin')
    const host = c.req.header('host')?.toLowerCase()
    // The content origin serves shared sites only; the console's routes and cookies never run there.
    if (host === contentHost && host !== publicHost && !c.req.path.startsWith('/p/') && c.req.path !== '/health') return c.text('Not found', 404)
    if (c.req.path.startsWith('/api/') || c.req.path === '/mcp') c.header('Cache-Control', 'no-store')
    await next()
  })
  app.use('/api/*', bodyLimit({ maxSize: 1 << 20, onError: c => c.json({ error: 'request-too-large' }, 413) }))
  app.get('/health', c => c.json({ status: 'ok' }))
  app.get('/ready', async c => { await db.query('SELECT 1'); return c.json({ status: 'ready' }) })
  authRoutes(app, auth)

  const spaceOf = async (user: CloudUser): Promise<string> => {
    await db.query('INSERT INTO spaces (id, owner_id) VALUES ($1, $2) ON CONFLICT (owner_id) DO NOTHING', [randomUUID(), user.id])
    return (await db.query<{ id: string }>('SELECT id FROM spaces WHERE owner_id = $1', [user.id])).rows[0]!.id
  }
  const current = async (request: Request) => { const user = await auth.requireUser(request); return { user, space: await spaceOf(user) } }
  const mutate = async (request: Request) => { await auth.assertCsrf(request); return current(request) }
  const studioView = async (space: string) => {
    const studio = await studios.get(space)
    return { ...studio, url: studioOrigins(config, studio.slug).studio }
  }

  app.get('/api/me', async c => {
    const user = await auth.user(c.req.raw)
    if (!user) return c.json({ user: null })
    const session = await (await app.request(new URL('/api/auth/session', config.publicUrl).href, { headers: c.req.raw.headers })).json() as { csrfToken: string | null }
    return c.json({ user, csrfToken: session.csrfToken, mcpUrl: new URL('/mcp', config.publicUrl).href })
  })
  app.get('/api/studio', async c => c.json({ studio: await studioView((await current(c.req.raw)).space) }))
  app.post('/api/studio/start', async c => { const { space } = await mutate(c.req.raw); await studios.start(space); return c.json({ studio: await studioView(space) }) })
  app.post('/api/studio/stop', async c => { const { space } = await mutate(c.req.raw); await studios.stop(space); gateway.forget(space); return c.json({ studio: await studioView(space) }) })
  // A navigation: the console's session cookie (SameSite=Lax) opens the owner's own running Studio.
  app.get('/api/studio/open', async c => {
    const user = await auth.user(c.req.raw)
    if (!user) return c.redirect('/')
    const space = await spaceOf(user)
    try {
      return c.redirect(await gateway.open(c.req.raw, user, space, { document: c.req.query('document'), id: c.req.query('id') }), 303)
    } catch (error) {
      if (error instanceof CloudError && error.status === 409) return c.redirect(`/studio${new URL(c.req.url).search}`, 303)
      throw error
    }
  })
  app.get('/api/documents', async c => {
    const { space } = await current(c.req.raw)
    const connection = await studios.connection(space).catch(() => undefined)
    if (!connection) return c.json({ documents: null })
    return c.json(await (await studios.control(connection, '/documents')).json())
  })

  app.get('/api/tokens', async c => c.json({ tokens: await tokens.list((await current(c.req.raw)).space) }))
  app.post('/api/tokens', async c => { const { user, space } = await mutate(c.req.raw); return c.json({ token: await tokens.create(space, user.id, await c.req.json()) }, 201) })
  app.delete('/api/tokens/:id', async c => { const { space } = await mutate(c.req.raw); await tokens.revoke(space, c.req.param('id')); return c.json({ revoked: true }) })

  app.get('/api/shares', async c => c.json({ shares: await shares.list((await current(c.req.raw)).space) }))
  app.post('/api/shares', async c => { const { user, space } = await mutate(c.req.raw), body = await c.req.json(); return c.json({ share: await shares.create(space, user, body.document, body.title) }, 201) })
  app.delete('/api/shares/:id', async c => { const { space } = await mutate(c.req.raw); await shares.revoke(space, c.req.param('id')); return c.json({ revoked: true }) })
  app.get('/api/shared/:slug', async c => c.json({ share: await shares.describe(c.req.param('slug')) }))
  app.post('/api/shared/:slug/fork', async c => {
    const { space } = await mutate(c.req.raw)
    const forked = await shares.fork(c.req.param('slug'), space)
    return c.json({ ...forked, open: `/api/studio/open?${new URLSearchParams({ document: forked.document, id: forked.id })}` }, 201)
  })

  // Caddy's on-demand TLS asks here (inside the deployment network) before issuing a Studio host's certificate.
  app.get('/internal/tls', async c => {
    const host = c.req.header('host')?.toLowerCase()
    if (host === publicHost || host === contentHost) return c.text('Not found', 404)
    const named = studioHost(config, c.req.query('domain'))
    return named && await studios.bySlug(named.slug) ? c.text('ok') : c.text('unknown', 404)
  })
  shares.routes(app, contentHost)
  registerMcp(app, { tokens, studios, gateway, publicUrl: config.publicUrl })
  app.get('/api/*', c => c.json({ error: 'route-not-found' }, 404))
  const web = fileURLToPath(new URL('../../dist/web/', import.meta.url))
  app.use('/*', serveStatic({ root: web }))
  app.get('*', serveStatic({ root: web, path: 'index.html' }))

  const console = getRequestListener(app.fetch)
  return {
    app, db, auth, studios, storage, gateway,
    /** The Node request listener: Studio hosts go to the gateway, everything else to the console. */
    listener(request: IncomingMessage, response: ServerResponse) {
      if (gateway.handles(request)) void gateway.web(request, response)
      else void console(request, response)
    },
    async upgrade(request: IncomingMessage, socket: Duplex, head: Buffer) {
      if (gateway.handles(request)) await gateway.upgrade(request, socket, head)
      else socket.destroy()
    },
    async close() { gateway.close(); storage.close(); if (!database) await db.close() },
  }
}
