import { timingSafeEqual } from 'node:crypto'
import http from 'node:http'
import https from 'node:https'
import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { CloudError, requireId } from '../domain/errors.ts'
import type { CloudCapability } from '../domain/plans.ts'
import type { AuthService } from './auth.ts'
import type { CloudConfig } from './config.ts'
import { Database } from './database.ts'
import { DockerEngine } from './docker.ts'
import { createEnvironments } from './environments.ts'
import type { Environments, RuntimeContext } from './environments.ts'
import { createRuntimeRunner } from './runner.ts'
import type { RuntimeJobInput } from './runner.ts'
import { ObjectStorage } from './storage.ts'
import { Spaces } from './spaces.ts'
import { Usage } from './usage.ts'
import { refreshRuntimeInput } from './admission.ts'
import { RuntimeStorage } from './runtime-storage.ts'

function same(a: string, b: string): boolean { const left = Buffer.from(a), right = Buffer.from(b); return left.length === right.length && timingSafeEqual(left, right) }
const contextHeader = 'x-presmium-runtime-context'
const proxyPattern = /^\/api\/spaces\/([a-f0-9-]+)\/environments\/([a-f0-9-]+)\/proxy\/(.*)$/
function relativeTarget(rest: string, base: string): URL {
  if (rest.startsWith('/') || rest.includes('\\') || rest.includes('\0')) throw new CloudError(400, 'runtime-proxy-path-invalid')
  const original = new URL(base), target = new URL(rest, original)
  if (target.origin !== original.origin || !target.pathname.startsWith(original.pathname)) throw new CloudError(400, 'runtime-proxy-path-invalid')
  return target
}

function headersOf(request: Request, authorization?: string): Headers {
  const headers = new Headers(request.headers)
  for (const key of ['cookie', 'authorization', 'host', 'connection', 'proxy-authorization', 'proxy-authenticate', 'transfer-encoding', 'x-forwarded-host', contextHeader]) headers.delete(key)
  if (authorization) headers.set('authorization', authorization)
  return headers
}

async function relay(request: Request, url: URL, headers: Headers): Promise<Response> {
  const response = await fetch(url, { method: request.method, headers, ...request.method !== 'GET' && request.method !== 'HEAD' ? { body: request.body, duplex: 'half' } : {}, redirect: 'manual', signal: request.signal } as RequestInit)
  const outgoing = new Headers(response.headers)
  outgoing.delete('set-cookie'); outgoing.delete('connection'); outgoing.delete('transfer-encoding')
  return new Response(response.body, { status: response.status, headers: outgoing })
}

export function nodeRequest(request: IncomingMessage, origin: string): Request {
  const headers = new Headers()
  for (const [key, value] of Object.entries(request.headers)) if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(', ') : value)
  return new Request(new URL(request.url ?? '/', origin), { headers })
}

/** Upgrade only after caller authorization; upstream cookies and tenant identity headers never pass through. */
function websocket(request: IncomingMessage, socket: Duplex, head: Buffer, target: URL, headers: Headers, stillAllowed: () => Promise<void>) {
  const transport = target.protocol === 'https:' ? https : http
  const upstream = transport.request(target, { method: 'GET', headers: { ...Object.fromEntries(headers), connection: 'Upgrade', upgrade: 'websocket' } })
  let interval: NodeJS.Timeout | undefined
  upstream.setTimeout(15_000, () => upstream.destroy())
  upstream.on('upgrade', (response, peer, upstreamHead) => {
    upstream.setTimeout(0)
    const lines = ['HTTP/1.1 101 Switching Protocols']
    for (const [key, value] of Object.entries(response.headers)) if (value !== undefined && key !== 'set-cookie') lines.push(`${key}: ${Array.isArray(value) ? value.join(', ') : value}`)
    socket.write(`${lines.join('\r\n')}\r\n\r\n`)
    if (upstreamHead.length) socket.write(upstreamHead)
    if (head.length) peer.write(head)
    socket.pipe(peer); peer.pipe(socket)
    socket.on('error', () => peer.destroy()); peer.on('error', () => socket.destroy())
    socket.on('close', () => { peer.destroy(); if (interval) clearInterval(interval) })
    peer.on('close', () => { socket.destroy(); if (interval) clearInterval(interval) })
    let checking = false
    interval = setInterval(() => { if (checking) return; checking = true; void stillAllowed().catch(() => { peer.destroy(); socket.destroy() }).finally(() => { checking = false }) }, 15_000)
    interval.unref()
  })
  upstream.on('response', response => { socket.end(`HTTP/1.1 ${response.statusCode ?? 502} Bad Gateway\r\nConnection: close\r\n\r\n`); response.resume() })
  upstream.on('error', () => socket.destroy())
  socket.on('close', () => upstream.destroy())
  upstream.end()
}

export class RuntimeClient {
  readonly config: NonNullable<CloudConfig['runner']>
  constructor(config: NonNullable<CloudConfig['runner']>) { this.config = config }
  async call<T>(collection: 'environments' | 'jobs', body: Record<string, unknown>): Promise<T> {
    const response = await fetch(new URL(`/internal/${collection}`, this.config.url), { method: 'POST', headers: { authorization: `Bearer ${this.config.token}`, 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) })
    const result = await response.json() as Record<string, unknown>
    if (!response.ok) throw new CloudError(response.status, typeof result.error === 'string' ? result.error : 'runtime-unavailable')
    return result as T
  }
  async proxy(request: Request, context: RuntimeContext, environmentId: string, rest: string, expectedGeneration?: number) {
    const url = new URL(`/internal/environments/${environmentId}/proxy/${rest}`, this.config.url); url.search = new URL(request.url).search
    const headers = headersOf(request, `Bearer ${this.config.token}`)
    headers.set(contextHeader, Buffer.from(JSON.stringify({ ...context, expectedGeneration, expires: Date.now() + 30_000 })).toString('base64url'))
    return relay(request, url, headers)
  }
  upgrade(request: IncomingMessage, socket: Duplex, head: Buffer, context: RuntimeContext, environmentId: string, rest: string, stillAllowed: () => Promise<void>, expectedGeneration?: number): void {
    const url = new URL(request.url ?? '/', 'http://runtime')
    const target = new URL(`/internal/environments/${requireId(environmentId)}/proxy/${rest}`, this.config.url); target.search = url.search
    const headers = headersOf(nodeRequest(request, 'http://runtime'), `Bearer ${this.config.token}`)
    headers.set(contextHeader, Buffer.from(JSON.stringify({ ...context, expectedGeneration, expires: Date.now() + 30_000 })).toString('base64url'))
    websocket(request, socket, head, target, headers, stillAllowed)
  }
}

export function registerRuntimeRoutes(app: Hono, deps: { auth: AuthService, spaces: Spaces, config: CloudConfig }) {
  const { auth, spaces, config } = deps, client = config.runner ? new RuntimeClient(config.runner) : undefined
  const context = async (request: Request, spaceId: string, capability: CloudCapability, mutation = false): Promise<RuntimeContext> => {
    if (mutation) await auth.assertCsrf(request)
    const user = await auth.requireUser(request), member = await spaces.authorize(user.id, spaceId, capability)
    if (!client) throw new CloudError(503, 'runtime-unavailable')
    return { workspaceId: spaceId, userId: user.id, billingAccountId: member.billingAccountId }
  }
  const environmentView = (environment: Record<string, unknown>) => ({ ...environment, status: environment.state, ownerId: environment.userId, ...environment.state === 'running' ? { url: new URL(`/api/spaces/${environment.workspaceId}/environments/${environment.id}/open`, config.publicUrl).href } : {} })
  app.get('/api/spaces/:sid/environments', async c => {
    const own = await context(c.req.raw, c.req.param('sid'), 'execute')
    const found = await client!.call<Record<string, unknown>[]>('environments', { context: own, action: 'list' })
    return c.json({ environments: found!.map(environmentView) })
  })
  app.post('/api/spaces/:sid/environments', async c => {
    const own = await context(c.req.raw, c.req.param('sid'), 'execute', true), body = await c.req.json()
    const result = await client!.call<Record<string, unknown>>('environments', { context: own, action: 'create', profileId: body.profileId, name: body.name ?? body.profileId })
    return c.json({ environment: environmentView(result) }, 201)
  })
  app.post('/api/spaces/:sid/environments/:id/stop', async c => {
    const own = await context(c.req.raw, c.req.param('sid'), 'execute', true)
    const result = await client!.call<Record<string, unknown>>('environments', { context: own, action: 'stop', environmentId: requireId(c.req.param('id')) })
    return c.json({ environment: environmentView(result) })
  })
  app.delete('/api/spaces/:sid/environments/:id', async c => {
    const own = await context(c.req.raw, c.req.param('sid'), 'execute', true)
    return c.json(await client!.call('environments', { context: own, action: 'destroy', environmentId: requireId(c.req.param('id')) }))
  })
  app.all('/api/spaces/:sid/environments/:id/proxy/*', async c => {
    // User-controlled files and JupyterLab must never execute under the cloud login origin.
    // This application-origin endpoint is for authenticated machine clients only.
    if (!c.req.raw.headers.has('authorization')) throw new CloudError(403, 'runtime-origin-required')
    // Native JupyterLab owns its XSRF protocol and cannot add our application header.
    // Exact Origin plus the authenticated, private environment is this proxy's CSRF gate.
    if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method) && !c.req.raw.headers.has('authorization') && c.req.header('origin') !== new URL(config.publicUrl).origin) throw new CloudError(403, 'auth-csrf-invalid')
    const own = await context(c.req.raw, c.req.param('sid'), 'execute')
    const prefix = `/api/spaces/${own.workspaceId}/environments/${c.req.param('id')}/proxy/`
    return client!.proxy(c.req.raw, own, requireId(c.req.param('id')), new URL(c.req.url).pathname.slice(prefix.length))
  })
  app.get('/api/spaces/:sid/jobs', async c => {
    const own = await context(c.req.raw, c.req.param('sid'), 'read')
    const jobs = await client!.call<Record<string, unknown>[]>('jobs', { context: own, action: 'list' })
    return c.json({ jobs: jobs.map(job => {
      const output = Array.isArray(job.output) ? job.output as Array<{ path: string }> : []
      const pdf = output.findIndex(file => file.path.endsWith('.pdf'))
      return { ...job, kind: job.kind === 'export' && job.format === 'pdf' ? 'export-pdf' : job.kind, status: job.state, updatedAt: job.finishedAt ?? job.startedAt ?? job.createdAt,
        ...job.state === 'succeeded' && pdf >= 0 ? { resultUrl: `/api/spaces/${own.workspaceId}/jobs/${job.id}/outputs/${pdf}` } : {} }
    }) })
  })
  app.get('/api/spaces/:sid/jobs/:id', async c => {
    const own = await context(c.req.raw, c.req.param('sid'), 'read')
    const job = await client!.call<Record<string, unknown>>('jobs', { context: own, action: 'get', jobId: requireId(c.req.param('id')) })
    const output = Array.isArray(job.output) ? job.output as Array<{ path: string }> : []
    const pdf = output.findIndex(file => file.path.endsWith('.pdf'))
    return c.json({ job: { ...job, kind: job.kind === 'export' && job.format === 'pdf' ? 'export-pdf' : job.kind, status: job.state, updatedAt: job.finishedAt ?? job.startedAt ?? job.createdAt,
      ...job.state === 'succeeded' && pdf >= 0 ? { resultUrl: `/api/spaces/${own.workspaceId}/jobs/${job.id}/outputs/${pdf}` } : {} } })
  })
  app.post('/api/spaces/:sid/jobs/:id/cancel', async c => {
    const own = await context(c.req.raw, c.req.param('sid'), 'read', true)
    return c.json({ job: await client!.call('jobs', { context: own, action: 'cancel', jobId: requireId(c.req.param('id')) }) })
  })
  return {
    client,
    async upgrade(request: IncomingMessage, socket: Duplex, head: Buffer) {
      const url = new URL(request.url ?? '/', config.publicUrl), found = proxyPattern.exec(url.pathname)
      if (!found || !client || !request.headers.authorization || request.headers.origin !== new URL(config.publicUrl).origin) { socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return }
      const own = await context(nodeRequest(request, config.publicUrl), found[1]!, 'execute')
      const target = new URL(`/internal/environments/${requireId(found[2])}/proxy/${found[3]}`, client.config.url); target.search = url.search
      const headers = headersOf(nodeRequest(request, config.publicUrl), `Bearer ${client.config.token}`)
      headers.set(contextHeader, Buffer.from(JSON.stringify({ ...own, expires: Date.now() + 30_000 })).toString('base64url'))
      websocket(request, socket, head, target, headers, async () => { await context(nodeRequest(request, config.publicUrl), own.workspaceId, 'execute') })
    },
  }
}

export async function createRuntimeHttp(config: CloudConfig, db: Database) {
  if (!config.runner?.token || !config.runtime.credentialKey || !config.storage || !config.runtime.storage) throw new CloudError(500, 'runtime-configuration-invalid')
  const engine = new DockerEngine({ socketPath: config.runtime.dockerSocket ?? '/var/run/docker.sock' })
  const spaces = new Spaces(db, config.publicUrl), billing = new Usage(db), storage = new ObjectStorage(db, config.storage)
  const disk = new RuntimeStorage(db, { ...config.runtime.storage, instanceId: config.runtime.instanceId })
  await disk.ready()
  const options = { instanceId: config.runtime.instanceId, credentialKey: config.runtime.credentialKey, runnerContainerId: config.runtime.runnerContainerId, jupyterOrigin: new URL(config.runtimeUrl).origin, storage: disk }
  const environments = createEnvironments(db, engine, config.runtime.profiles, billing, options)
  const runner = createRuntimeRunner(db, engine, config.runtime.profiles, billing, { ...options, inputOrigins: config.runtime.inputOrigins, refreshInput: request => refreshRuntimeInput(config, request), uploadOutput: async output => storage.put(output.workspaceId, output.bytes, 'application/octet-stream') }, environments)
  const app = new Hono()
  app.onError((error, c) => c.json({ error: error instanceof CloudError ? error.code : 'runtime-unavailable' }, (error instanceof CloudError ? error.status : 503) as 400))
  app.get('/health', c => c.json({ status: 'ok' }))
  app.get('/ready', async c => { await engine.ping(); await disk.ready(); await db.query('SELECT 1'); return c.json({ status: 'ready' }) })
  app.use('/internal/*', async (c, next) => { if (!same(c.req.header('authorization') ?? '', `Bearer ${config.runner!.token}`)) throw new CloudError(401, 'runtime-unauthorized'); await next() })
  app.use('/internal/*', bodyLimit({ maxSize: 3 << 20, onError: c => c.json({ error: 'request-too-large' }, 413) }))
  const authorized = async (context: RuntimeContext, capability: CloudCapability) => {
    const member = await spaces.authorize(requireId(context.userId), requireId(context.workspaceId), capability)
    if (member.billingAccountId !== context.billingAccountId) throw new CloudError(403, 'runtime-unauthorized')
    return context
  }
  app.post('/internal/environments', async c => {
    const body = await c.req.json(), own = await authorized(body.context, 'execute')
    switch (body.action) {
      case 'list': return c.json(await environments.list(own))
      case 'get': return c.json(await environments.get(own, body.environmentId))
      case 'create': return c.json(await environments.create(own, body.profileId, body.name))
      case 'start': return c.json(await environments.start(own, body.environmentId, body.operationId, body.expectedProfileDigest, body.expectedGeneration))
      case 'stop': return c.json(await environments.stop(own, body.environmentId))
      case 'destroy': return c.json(await environments.destroyEnvironment(own, body.environmentId))
      default: throw new CloudError(400, 'runtime-action-invalid')
    }
  })
  app.post('/internal/jobs', async c => {
    const body = await c.req.json(), own = await authorized(body.context, 'read')
    switch (body.action) {
      case 'list': return c.json(await runner.list(own))
      case 'get': return c.json(await runner.get(own, body.jobId))
      case 'cancel': return c.json(await runner.cancel(own, body.jobId))
      case 'submit': {
        if (body.input?.audience === 'student') await authorized(own, 'write')
        return c.json(await runner.submit(own, body.operationId, body.kind, body.profileId, body.input as RuntimeJobInput, body.expectedProfileDigest))
      }
      default: throw new CloudError(400, 'runtime-action-invalid')
    }
  })
  const proxyContext = async (request: Request, environmentId: string, checkExpiry = true): Promise<{ context: RuntimeContext, connection: Awaited<ReturnType<Environments['connection']>> }> => {
    const encoded = request.headers.get(contextHeader)
    if (!encoded || encoded.length > 2048) throw new CloudError(401, 'runtime-unauthorized')
    let own: RuntimeContext & { expires: number, expectedGeneration?: number }
    try { own = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) } catch { throw new CloudError(401, 'runtime-unauthorized') }
    if (checkExpiry && (!Number.isSafeInteger(own.expires) || own.expires < Date.now() || own.expires > Date.now() + 60_000)) throw new CloudError(401, 'runtime-unauthorized')
    await authorized(own, 'execute')
    const connection = await environments.connection(own, environmentId)
    if (own.expectedGeneration !== undefined && own.expectedGeneration !== connection.generation) throw new CloudError(409, 'runtime-generation-changed')
    await environments.touch(own, environmentId)
    return { context: own, connection }
  }
  app.all('/internal/environments/:id/proxy/*', async c => {
    const own = await proxyContext(c.req.raw, requireId(c.req.param('id')))
    const prefix = `/internal/environments/${c.req.param('id')}/proxy/`, target = relativeTarget(new URL(c.req.url).pathname.slice(prefix.length), own.connection.url)
    target.search = new URL(c.req.url).search
    const headers = headersOf(c.req.raw)
    for (const [name, value] of Object.entries(own.connection.headers)) headers.set(name, value)
    return relay(c.req.raw, target, headers)
  })
  const controller = new AbortController()
  const running = runner.run(controller.signal)
  return {
    app,
    async upgrade(request: IncomingMessage, socket: Duplex, head: Buffer) {
      if (!same(request.headers.authorization ?? '', `Bearer ${config.runner!.token}`)) { socket.destroy(); return }
      const parsed = new URL(request.url ?? '/', 'http://runner'), match = /^\/internal\/environments\/([a-f0-9-]+)\/proxy\/(.*)$/.exec(parsed.pathname)
      if (!match) { socket.destroy(); return }
      const web = nodeRequest(request, 'http://runner'), own = await proxyContext(web, requireId(match[1]))
      const target = relativeTarget(match[2]!, own.connection.url); target.search = parsed.search
      const headers = headersOf(web)
      for (const [name, value] of Object.entries(own.connection.headers)) headers.set(name, value)
      websocket(request, socket, head, target, headers, async () => { const next = await proxyContext(web, match[1]!, false); if (next.connection.generation !== own.connection.generation) throw new CloudError(409, 'runtime-generation-changed') })
    },
    async close() { controller.abort(); await runner.close(); await running; await storage.close(); engine.close() },
  }
}
