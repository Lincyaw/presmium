import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { serveStatic } from '@hono/node-server/serve-static'
import { fileURLToPath } from 'node:url'
import { CloudError, requireId, requireInteger, requireText } from '../domain/errors.ts'
import { PLANS } from '../domain/plans.ts'
import { authRoutes, createAuthService } from './auth.ts'
import { billingRoutes, createBillingService } from './billing.ts'
import type { CloudConfig } from './config.ts'
import { Database } from './database.ts'
import { Documents } from './documents.ts'
import { Spaces } from './spaces.ts'
import { ObjectStorage } from './storage.ts'
import { Usage } from './usage.ts'
import { registerRuntimeRoutes } from './runtime-http.ts'
import { registerCloudMcpRoutes } from './mcp-routes.ts'
import { workbenchRoutes } from './workbench-routes.ts'
import { registerRuntimeAccess } from './runtime-access.ts'
import { registerAdmissionRoutes } from './admission.ts'
import { registerContentRoutes } from './content.ts'

export async function createCloudApp(config: CloudConfig, database?: Database) {
  const db = database ?? new Database(config.databaseUrl)
  const auth = await createAuthService(db, config.auth), spaces = new Spaces(db, config.publicUrl), documents = new Documents(db, spaces), usage = new Usage(db)
  const billing = createBillingService(db, config.billing), storage = config.storage ? new ObjectStorage(db, config.storage) : undefined
  const app = new Hono()
  app.onError((error, c) => {
    if (error instanceof CloudError) return c.json({ error: error.code, ...error.details ? { details: error.details } : {} }, error.status as 400)
    process.stderr.write(`cloud request failed: ${error instanceof Error ? error.stack : String(error)}\n`)
    return c.json({ error: 'service-unavailable' }, 503)
  })
  app.use('*', async (c, next) => {
    c.header('X-Content-Type-Options', 'nosniff')
    c.header('Referrer-Policy', 'same-origin')
    if (c.req.path.startsWith('/api/') || c.req.path.startsWith('/mcp')) c.header('Cache-Control', 'no-store')
    await next()
  })
  const jsonLimit = bodyLimit({ maxSize: 3 << 20, onError: c => c.json({ error: 'request-too-large' }, 413) })
  app.use('/api/*', async (c, next) => /^\/api\/spaces\/[^/]+\/(?:objects|presmium\/document\/image)$/.test(c.req.path) && c.req.method === 'POST' ? next() : jsonLimit(c, next))
  app.get('/health', c => c.json({ status: 'ok' }))
  app.get('/ready', async c => { await db.query('SELECT 1'); return c.json({ status: 'ready' }) })
  authRoutes(app, auth)
  const current = async (request: Request) => { const user = await auth.requireUser(request); await spaces.ensurePersonal(user); return user }
  const mutate = async (request: Request) => { await auth.assertCsrf(request); return current(request) }
  const accountOwner = async (userId: string, accountId: string) => {
    const row = (await db.query('SELECT id FROM spaces WHERE billing_account_id=$1', [requireId(accountId)])).rows[0]
    if (!row) throw new CloudError(404, 'space-not-found')
    await spaces.authorize(userId, row.id, 'manage')
  }
  billingRoutes(app, { service: billing, requireUser: auth.requireUser, assertCsrf: auth.assertCsrf, authorizeAccount: accountOwner })
  app.get('/api/me', async c => {
    const response = await app.request(new URL('/api/auth/session', config.publicUrl).href, { headers: c.req.raw.headers })
    const session = await response.json() as Record<string, unknown>
    if (session.user) await spaces.ensurePersonal(session.user as Parameters<Spaces['ensurePersonal']>[0])
    return c.json({ ...session, capabilities: { oidc: true, ai: false, billing: billing.configured, storage: Boolean(storage), runtime: Boolean(config.runner) } })
  })
  app.get('/api/spaces', async c => c.json({ spaces: await spaces.list((await current(c.req.raw)).id) }))
  app.post('/api/spaces', async c => { const user = await mutate(c.req.raw), body = await c.req.json(); return c.json({ space: await spaces.create(user, body.name) }, 201) })
  app.get('/api/spaces/:sid/members', async c => c.json(await spaces.members((await current(c.req.raw)).id, c.req.param('sid'))))
  app.post('/api/spaces/:sid/members', async c => c.json({ invitation: await spaces.invite(await mutate(c.req.raw), c.req.param('sid'), await c.req.json()) }, 201))
  app.delete('/api/spaces/:sid/members/:uid', async c => { await spaces.removeMember((await mutate(c.req.raw)).id, c.req.param('sid'), c.req.param('uid')); return c.json({ removed: true }) })
  app.delete('/api/spaces/:sid/invitations/:id', async c => { await spaces.revokeInvitation((await mutate(c.req.raw)).id, c.req.param('sid'), c.req.param('id')); return c.json({ revoked: true }) })
  app.post('/api/invitations/:token/accept', async c => c.json(await spaces.accept(await mutate(c.req.raw), c.req.param('token'))))
  app.get('/api/spaces/:sid/tokens', async c => c.json({ tokens: await spaces.listTokens((await current(c.req.raw)).id, c.req.param('sid')) }))
  app.post('/api/spaces/:sid/tokens', async c => c.json({ token: await spaces.createToken((await mutate(c.req.raw)).id, c.req.param('sid'), await c.req.json()) }, 201))
  app.delete('/api/spaces/:sid/tokens/:id', async c => { await spaces.revokeToken((await mutate(c.req.raw)).id, c.req.param('sid'), c.req.param('id')); return c.json({ revoked: true }) })
  app.get('/api/spaces/:sid/documents', async c => c.json({ documents: await documents.list((await current(c.req.raw)).id, c.req.param('sid')) }))
  app.post('/api/spaces/:sid/documents', async c => { const user = await mutate(c.req.raw), body = await c.req.json(); return c.json({ document: await documents.create(user.id, c.req.param('sid'), body.title, body.lang) }, 201) })
  app.get('/api/spaces/:sid/documents/:id', async c => c.json(await documents.read((await current(c.req.raw)).id, c.req.param('sid'), c.req.param('id'))))
  app.post('/api/spaces/:sid/documents/:id/plan', async c => c.json(await documents.plan((await mutate(c.req.raw)).id, c.req.param('sid'), c.req.param('id'), await c.req.json())))
  app.post('/api/spaces/:sid/documents/:id/apply', async c => { const user = await mutate(c.req.raw), body = await c.req.json(); return c.json(await documents.apply(user.id, c.req.param('sid'), c.req.param('id'), body.planId, body.change)) })
  app.post('/api/spaces/:sid/documents/:id/change', async c => c.json(await documents.change((await mutate(c.req.raw)).id, c.req.param('sid'), c.req.param('id'), await c.req.json())))
  app.get('/api/spaces/:sid/documents/:id/history', async c => c.json(await documents.historyPage((await current(c.req.raw)).id, c.req.param('sid'), c.req.param('id'), { cursor: c.req.query('cursor') })))
  app.post('/api/spaces/:sid/documents/:id/restore', async c => c.json(await documents.restore((await mutate(c.req.raw)).id, c.req.param('sid'), c.req.param('id'), await c.req.json())))
  app.get('/api/spaces/:sid/usage', async c => {
    const member = await spaces.authorize((await current(c.req.raw)).id, c.req.param('sid'))
    return c.json({ usage: await usage.read(member.billingAccountId) })
  })
  app.put('/api/spaces/:sid/budget', async c => {
    const member = await spaces.authorize((await mutate(c.req.raw)).id, c.req.param('sid'), 'manage'), body = await c.req.json()
    await usage.setBudget(member.billingAccountId, requireInteger(body.monthlyLimitMinor)); return c.json({ usage: await usage.read(member.billingAccountId) })
  })
  app.get('/api/spaces/:sid/billing', async c => {
    const member = await spaces.authorize((await current(c.req.raw)).id, c.req.param('sid'), 'manage')
    return c.json({ billing: { ...await billing.subscription(member.billingAccountId), available: billing.configured, plans: Object.values(PLANS).map(plan => ({ ...plan, name: plan.id })) } })
  })
  for (const action of ['checkout', 'portal'] as const) app.post(`/api/spaces/:sid/billing/${action}`, async c => {
    const member = await spaces.authorize((await mutate(c.req.raw)).id, c.req.param('sid'), 'manage'), body = action === 'checkout' ? await c.req.json() : {}
    return c.json(action === 'checkout' ? await billing.checkout(member.billingAccountId, requireText(body.planId ?? body.plan), requireText(body.requestId)) : await billing.portal(member.billingAccountId))
  })
  app.get('/api/runtime/profiles', async c => { await current(c.req.raw); return c.json({ profiles: config.runtime.profiles.map(({ id, kind, cpu, memoryBytes, diskBytes, maxDurationSeconds, pricePerMinuteMinor }) => ({ id, name: id, kind, cpu, memoryBytes, diskBytes, maxDurationSeconds, pricePerMinuteMinor })) }) })

  const runtime = registerRuntimeRoutes(app, { auth, spaces, config })
  const admission = registerAdmissionRoutes(app, { db, auth, spaces, documents, usage, storage, runtime: runtime.client, config })
  const content = registerContentRoutes(app, { db, spaces, documents, storage, config, auth, admission })
  const runtimeAccess = runtime.client ? registerRuntimeAccess(app, { db, auth, spaces, runtime: runtime.client, publicUrl: config.publicUrl, runtimeUrl: config.runtimeUrl }) : undefined
  const mcp = registerCloudMcpRoutes(app, { auth, spaces, documents, usage, admission, runtime: runtime.client, profiles: config.runtime.profiles, storage, publicUrl: config.publicUrl })
  const workbench = workbenchRoutes(app, { db, spaces, documents, current, mutate, publicUrl: config.publicUrl, content, storage, admission })
  app.get('/api/spaces/:sid/documents/:id/editor', async c => {
    const user = await current(c.req.raw), member = await spaces.authorize(user.id, c.req.param('sid'))
    await documents.read(user.id, c.req.param('sid'), c.req.param('id'))
    return c.json({ available: true, readOnly: member.role === 'reader', apiBase: `/api/spaces/${c.req.param('sid')}/presmium/`, document: c.req.param('id') })
  })

  app.get('/api/spaces/:sid/objects/:sha', async c => {
    const spaceId = c.req.param('sid'); await spaces.authorize((await current(c.req.raw)).id, spaceId)
    if (!storage) throw new CloudError(503, 'asset-storage-unavailable')
    if (!/^[a-f0-9]{64}$/.test(c.req.param('sha'))) throw new CloudError(400, 'invalid-object-key')
    const object = await storage.get(spaceId, `spaces/${spaceId}/${c.req.param('sha')}`)
    return new Response(object.body, { headers: { 'Content-Type': 'application/octet-stream', 'Content-Disposition': 'attachment', 'Content-Length': String(object.bytes), 'X-Content-Type-Options': 'nosniff' } })
  })
  app.post('/api/spaces/:sid/objects', async c => {
    const spaceId = c.req.param('sid'); await spaces.authorize((await mutate(c.req.raw)).id, spaceId, 'write')
    if (!storage) throw new CloudError(503, 'asset-storage-unavailable')
    const limit = 100 * 1024 * 1024
    if (Number(c.req.header('content-length')) > limit) throw new CloudError(413, 'asset-too-large')
    const reader = c.req.raw.body?.getReader(), chunks: Uint8Array[] = []
    let size = 0
    try {
      while (reader) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > limit) { await reader.cancel(); throw new CloudError(413, 'asset-too-large') }
        chunks.push(value)
      }
    } finally { reader?.releaseLock() }
    return c.json(await storage.put(spaceId, Buffer.concat(chunks), c.req.header('content-type') ?? 'application/octet-stream'), 201)
  })
  app.get('/api/*', c => c.json({ error: 'route-not-found' }, 404))
  const web = fileURLToPath(new URL('../../dist/web/', import.meta.url))
  app.use('/*', serveStatic({ root: web }))
  app.get('*', serveStatic({ root: web, path: 'index.html' }))
  let checking = false
  const recover = async () => { if (checking) return; checking = true; try { await billing.processPendingEvents() } catch (error) { process.stderr.write(`cloud billing recovery: ${error instanceof CloudError ? error.code : 'failed'}\n`) } finally { checking = false } }
  const interval = setInterval(() => void recover(), 5000); interval.unref()
  void recover()
  return {
    app, db, auth, spaces, documents, usage, billing, storage, admission, content,
    async upgrade(...args: Parameters<typeof runtime.upgrade>) { if (!await runtimeAccess?.upgrade(...args)) await runtime.upgrade(...args) },
    async close() { clearInterval(interval); await runtimeAccess?.close(); await workbench.close(); await mcp.close(); await storage?.close(); if (!database) await db.close() },
  }
}
