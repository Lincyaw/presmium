import { fileURLToPath } from 'node:url'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { serveStatic } from '@hono/node-server/serve-static'
import { CloudError } from '../domain/errors.ts'
import { authRoutes, createAuthService } from './auth.ts'
import type { CloudConfig } from './config.ts'
import { Database } from './database.ts'
import { Hub } from './hub.ts'
import { AccessTokens, registerMcp } from './mcp.ts'
import { Shares } from './shares.ts'
import { ObjectStorage } from './storage.ts'

/** The console (login, the user's Studio, sharing, MCP access) and the shared sites; Studio itself is JupyterHub's. */
export async function createCloudApp(config: CloudConfig, database?: Database) {
  const db = database ?? new Database(config.databaseUrl)
  const auth = await createAuthService(db, config.auth)
  const hub = new Hub(config.hub), storage = new ObjectStorage(config.storage)
  const shares = new Shares(db, storage, hub, config.contentUrl), tokens = new AccessTokens(db)
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

  const current = (request: Request) => auth.requireUser(request)
  const mutate = async (request: Request) => { await auth.assertCsrf(request); return current(request) }
  const studio = async (name: string) => ({ state: await hub.state(name), url: hub.openUrl() })

  app.get('/api/me', async c => {
    const user = await auth.user(c.req.raw)
    if (!user) return c.json({ user: null })
    const session = await (await app.request(new URL('/api/auth/session', config.publicUrl).href, { headers: c.req.raw.headers })).json() as { csrfToken: string | null }
    return c.json({ user, csrfToken: session.csrfToken, mcpUrl: new URL('/mcp', config.publicUrl).href })
  })
  app.get('/api/studio', async c => c.json({ studio: await studio(hub.name(await current(c.req.raw))) }))
  app.post('/api/studio/stop', async c => { const name = hub.name(await mutate(c.req.raw)); await hub.stop(name); return c.json({ studio: await studio(name) }) })
  app.get('/api/documents', async c => {
    const name = hub.name(await current(c.req.raw))
    if (await hub.state(name) !== 'running') return c.json({ documents: null })
    const answer = await (await hub.control(name, '/documents')).json() as { documents: Array<{ document: string, id: string, title: string }> }
    return c.json({ documents: answer.documents.map(document => ({ ...document, url: hub.openUrl(document) })) })
  })

  app.get('/api/tokens', async c => c.json({ tokens: await tokens.list(await current(c.req.raw)) }))
  app.post('/api/tokens', async c => { const user = await mutate(c.req.raw); return c.json({ token: await tokens.create(user, await c.req.json()) }, 201) })
  app.delete('/api/tokens/:id', async c => { await tokens.revoke(await mutate(c.req.raw), c.req.param('id')); return c.json({ revoked: true }) })

  app.get('/api/shares', async c => c.json({ shares: await shares.list(await current(c.req.raw)) }))
  app.post('/api/shares', async c => { const user = await mutate(c.req.raw), body = await c.req.json(); return c.json({ share: await shares.create(user, body.document, body.title) }, 201) })
  app.delete('/api/shares/:id', async c => { await shares.revoke(await mutate(c.req.raw), c.req.param('id')); return c.json({ revoked: true }) })
  app.get('/api/shared/:slug', async c => c.json({ share: await shares.describe(c.req.param('slug')) }))
  app.post('/api/shared/:slug/fork', async c => {
    const copy = await shares.fork(c.req.param('slug'), await mutate(c.req.raw))
    return c.json({ ...copy, open: hub.openUrl(copy) }, 201)
  })

  shares.routes(app, contentHost)
  registerMcp(app, { tokens, hub, publicUrl: config.publicUrl })
  app.get('/api/*', c => c.json({ error: 'route-not-found' }, 404))
  const web = fileURLToPath(new URL('../../dist/web/', import.meta.url))
  app.use('/*', serveStatic({ root: web }))
  app.get('*', serveStatic({ root: web, path: 'index.html' }))

  return {
    app, db, auth, storage,
    async close() { storage.close(); if (!database) await db.close() },
  }
}
