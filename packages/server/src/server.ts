import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs'
import type { IncomingMessage } from 'node:http'
import { dirname } from 'node:path'
import { APPROVALS, errorMessage, isRecord, jsonResponse, MAX_BODY, MCP_ENDPOINT, prefixedLogger, problemResponse, sseResponse } from '@lincyaw/kernel'
import type {
  ApprovalKind,
  Logger,
  McpEndpoint,
  Member,
  ProxySpec,
  Route,
  ServerContext,
  ServerContribution,
  ServiceToken,
  PreviewDiagnostics,
  Finding,
} from '@lincyaw/kernel'
import { pluginLogger } from '@lincyaw/compiler'
import { createPresmiumMcp } from '@lincyaw/mcp'
import type { McpCaller } from '@lincyaw/mcp'
import { authenticate, LOCAL_AUTHOR, machineHosts } from './auth.ts'
import type { Refusal } from './auth.ts'
import { Control, hasRole } from './control.ts'
import type { ApprovalPolicy, WindowPosition } from './control.ts'
import { focusBody, FocusStore } from './focus.ts'
import { DiagnosticStore } from './diagnostics.ts'
import type { ServedDocument, ServerHost } from './host.ts'
import { bearer, closeServer, createProxy, header, isLoopback, limitBody, listen, nodeServer, urlHost } from './http.ts'
import type { Decision, ProxyTarget } from './http.ts'
import { serverMcpHost } from './mcp.ts'

export { LOCAL_AUTHOR }

export const SERVER_PATH = '/__presmium/presmium.server'

function isMcp(path: string): boolean {
  return path === '/mcp' || path.startsWith('/mcp/')
}

function endedBy(response: Response, signal: AbortSignal, done: () => void): Response {
  if (!response.body) {
    done()
    return response
  }
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
  void response.body.pipeTo(writable, { signal, preventAbort: true })
    .catch(() => writable.close().catch(() => undefined))
    .finally(done)
  return new Response(readable, { status: response.status, statusText: response.statusText, headers: response.headers })
}

export interface ServerOptions {
  mode: 'dev' | 'serve'
  host?: string
  port?: number
  document(dir: string): Promise<ServedDocument | undefined>
  serverHost?: ServerHost
  settings?: Record<string, Record<string, unknown>>
  approvals?: Partial<Record<ApprovalKind, ApprovalPolicy>>
  forward?(): string | undefined
  operatorDir?: string
  stateFile?: string
  mcp?(request: Request, access: McpCaller): Promise<Response>
  env?: NodeJS.ProcessEnv
  approvalTimeoutMs?: number
  log?: Logger
  diagnostics?: DiagnosticStore
}

export interface PresmiumServer {
  url: string
  port: number
  token: string
  services: [ServiceToken<unknown>, unknown][]
  control: Control
  diagnostics: DiagnosticStore
  serverHost?: ServerHost
  unmount(dir: string, options?: { preserveFocus?: boolean }): Promise<void>
  close(): Promise<void>
}

interface Mounted {
  doc: ServedDocument
  contributions: Map<string, ServerContribution>
}

function pluginPath(pathname: string): { plugin: string, path: string, raw: string, plain: boolean } | undefined {
  const match = /^\/__presmium\/([^/]+)\/?(.*)$/.exec(pathname)
  if (!match) return undefined
  const raw = match[2]!
  let path = raw
  let plain = !/%(?:2f|5c)/i.test(raw) && !raw.includes('\\')
  try {
    path = decodeURIComponent(raw)
  } catch {
    plain = false
  }
  if (path.split('/').some(part => part === '.' || part === '..')) plain = false
  return { plugin: match[1]!, path, raw, plain }
}

function findRoute(routes: Record<string, Route> | undefined, path: string): { route: Route, rest: string, key: string } | undefined {
  if (!routes) return undefined
  if (routes[path] && !path.endsWith('/*')) return { route: routes[path]!, rest: '', key: path }
  let best: { route: Route, rest: string, key: string } | undefined
  for (const [key, route] of Object.entries(routes)) {
    if (!key.endsWith('/*')) continue
    const prefix = key.slice(0, -1)
    const base = key.slice(0, -2)
    if ((path.startsWith(prefix) || path === base) && (!best || key.length > best.key.length)) best = { route, rest: path.slice(prefix.length), key }
  }
  return best
}

function findProxy(proxies: ProxySpec[] | undefined, path: string): { spec: ProxySpec, rest: string } | undefined {
  for (const spec of proxies ?? []) {
    const base = spec.path.replace(/^\/+|\/+$/g, '')
    if (path === base || path.startsWith(`${base}/`)) return { spec, rest: path.slice(base.length) }
  }
  return undefined
}

function documentOf(headers: IncomingMessage['headers'], url: URL): string {
  const value = header(headers, 'presmium-document') ?? url.searchParams.get('document') ?? ''
  try {
    return decodeURIComponent(value).replace(/^\/+|\/+$/g, '')
  } catch {
    return value
  }
}

function remoteHost(mode: ServerOptions['mode'], host: string, port: number | undefined): string | undefined {
  if (mode === 'serve' || isLoopback(host)) return undefined
  const at = port || 'its port'
  return `presmium ${mode} listens on this machine only, not on ${host}: it serves the one user who runs it. To use it from another machine, forward its port over SSH (ssh -L ${at}:127.0.0.1:${at} <this machine>), or use presmium serve --host`
}

export async function startServer(options: ServerOptions): Promise<PresmiumServer> {
  const env = options.env ?? process.env
  const log = options.log ?? pluginLogger('presmium server')
  const listenHost = options.host ?? '127.0.0.1'
  const refused = remoteHost(options.mode, listenHost, options.port)
  if (refused) throw new Error(refused)
  const local = machineHosts(listenHost)

  const control = new Control({
    policy: options.approvals ?? {},
    timeoutMs: options.approvalTimeoutMs,
  })
  const token = randomBytes(24).toString('base64url')
  const mcpTokens = new Map<string, McpCaller>()
  const mcpStreams = new Map<string, Set<AbortController>>()
  let url = ''
  const mcpEndpoint: McpEndpoint = {
    issue(member, mode, issued = {}) {
      const value = randomBytes(24).toString('base64url')
      mcpTokens.set(value, { member, mode, ...issued.confirmed ? { confirmed: true } : {}, ...issued.document !== undefined ? { document: issued.document } : {} })
      return {
        url: `${url}/mcp`,
        token: value,
        revoke: () => {
          mcpTokens.delete(value)
          for (const stream of mcpStreams.get(value) ?? []) stream.abort()
          mcpStreams.delete(value)
        },
      }
    },
  }
  const services: [ServiceToken<unknown>, unknown][] = [[APPROVALS, control.approvals], [MCP_ENDPOINT, mcpEndpoint]]

  const serviceToken = env.PRESMIUM_SERVICE_TOKEN || undefined
  const fromHost = (request: Request) => {
    const given = bearer(request.headers.get('authorization'))
    if (!serviceToken || given === undefined || given.length !== serviceToken.length) return false
    return timingSafeEqual(Buffer.from(given), Buffer.from(serviceToken))
  }
  const sessions = new Map<string, ReturnType<McpEndpoint['issue']>>()
  const focus = new FocusStore()
  const diagnostics = options.diagnostics ?? new DiagnosticStore()
  const own = new Map(services.map(([token, impl]) => [token.id, impl]))

  const mounted = new Map<string, Promise<Mounted | undefined>>()
  const tearingDown = new Map<string, Promise<void>>()
  let closing = false
  const mount = (dir: string) => {
    if (closing) return Promise.resolve(undefined)
    let known = mounted.get(dir)
    if (!known) {
      const previous = tearingDown.get(dir)
      known = (async () => {
        await previous
        const doc = await options.document(dir)
        if (!doc) return undefined
        log.debug(`mounting the server contributions of ${dir || 'the deck'}: ${doc.plugins.filter(p => p.plugin.server).map(p => p.id).join(', ') || 'none'}`)
        const contributions = new Map<string, ServerContribution>()
        for (const { id, plugin, config } of doc.plugins) {
          if (!plugin.server) continue
          const operatorDir = options.operatorDir ?? doc.operatorDir
          const ctx: ServerContext = {
            deckDir: doc.deckDir,
            workspaceRoot: doc.workspaceRoot,
            config,
            settings: (options.settings ?? doc.settings)?.[id] ?? {},
            lang: doc.lang,
            service: <T>(token: ServiceToken<T>) => (own.get(token.id) as T | undefined) ?? doc.service(token),
            secret: name => env[name],
            ...operatorDir ? { operatorDir } : {},
            ...doc.home ? { home: true } : {},
            log: prefixedLogger(log, id),
          }
          try {
            contributions.set(id, await plugin.server.call(plugin, ctx))
            diagnostics.replace({ document: dir, origin: 'server', instance: id }, [])
          } catch (error) {
            log.error(`plugin ${id} failed to make its server contribution: ${errorMessage(error)}`)
            diagnostics.replace({ document: dir, origin: 'server', instance: id }, [{ checkId: id, severity: 'error', message: `plugin ${id} failed to make its server contribution: ${errorMessage(error)}` }])
          }
        }
        return { doc, contributions }
      })()
      const loading = known
      loading.then((found) => {
        if (!found && mounted.get(dir) === loading) mounted.delete(dir)
      }, () => {
        if (mounted.get(dir) === loading) mounted.delete(dir)
      })
      mounted.set(dir, known)
    }
    return known
  }

  const mcpHost = serverMcpHost({
    serverHost: options.serverHost,
    control,
    command: options.mode,
    mount: async dir => (await mount(dir))?.doc,
    mounted: async () => (await Promise.all([...mounted.values()].map(known => known.catch(() => undefined)))).flatMap(m => (m ? [m.doc] : [])),
    service: <T>(token: ServiceToken<T>) => own.get(token.id) as T | undefined,
    focus,
    diagnostics,
  })
  const mcp = options.mcp ? undefined : createPresmiumMcp(mcpHost)

  const members = new WeakMap<IncomingMessage, Member | Refusal>()
  const memberOf = (req: IncomingMessage): Member | Refusal => {
    let found = members.get(req)
    if (!found) members.set(req, found = authenticate(req, local))
    return found
  }

  const refuse = (refusal: Refusal): Decision => ({ kind: 'answer', response: problemResponse(refusal.status, refusal.message) })

  const decide = async (req: IncomingMessage): Promise<Decision> => {
    const url = new URL(req.url ?? '/', 'http://presmium')
    const path = url.pathname
    const member = memberOf(req)
    if ('status' in member) return refuse(member)
    const target = pluginPath(path)
    if (target && !target.plain) return refuse({ status: 400, message: 'a path with a . or .. part or an encoded separator' })
    if (isMcp(path)) return { kind: 'fetch' }
    if (target) {
      if (target.plugin === 'presmium.server') return { kind: 'fetch' }
      const proxy = await proxyOf(target, documentOf(req.headers, url), member, url.search)
      return proxy ?? { kind: 'fetch' }
    }
    const forward = options.mode === 'serve' ? options.forward?.() : undefined
    if (!forward) return { kind: 'answer', response: problemResponse(404, 'not found') }
    const site = new URL(forward)
    const lan = !isLoopback(header(req.headers, 'host'))
    const headers = lan ? { host: site.host, ...header(req.headers, 'origin') ? { origin: site.origin } : {} } : undefined
    return { kind: 'proxy', to: { target: forward, path: req.url ?? '/', ...headers ? { headers } : {} } }
  }

  const proxyOf = async (target: { plugin: string, path: string, raw: string }, dir: string, member: Member, search: string): Promise<Decision | undefined> => {
    const contribution = (await mount(dir))?.contributions.get(target.plugin)
    const found = findProxy(contribution?.proxies, target.path)
    if (!found) return undefined
    const role = found.spec.role ?? 'editor'
    if (!hasRole(member, role)) return refuse({ status: 403, message: `this proxy needs the role ${role}` })
    const base = found.spec.path.split('/').filter(Boolean).length
    const rest = target.raw.split('/').slice(base).join('/')
    const path = `${rest ? `/${rest}` : found.rest || '/'}${search}`
    return { kind: 'proxy', to: { target: found.spec.target, path, headers: found.spec.headers } }
  }

  const decideUpgrade = async (req: IncomingMessage): Promise<{ to?: ProxyTarget, status?: number }> => {
    const decision = await decide(req)
    if (decision.kind === 'proxy') return { to: decision.to }
    return { status: decision.kind === 'answer' ? decision.response.status : 404 }
  }

  const serveMcp = async (request: Request): Promise<Response> => {
    const given = bearer(request.headers.get('authorization'))
    const access: McpCaller | undefined = given === undefined ? undefined : given === token ? { member: LOCAL_AUTHOR, mode: 'author' as const } : mcpTokens.get(given)
    if (!access) return problemResponse(401, 'MCP needs an Authorization: Bearer token')
    const limited = await limitBody(request, MAX_BODY)
    if (limited instanceof Response) return limited
    request = limited
    const response = await (options.mcp ? options.mcp(request, access) : mcp!.fetch(request, access))
    if (given === token || !response.headers.get('content-type')?.startsWith('text/event-stream')) return response
    if (!mcpTokens.has(given!)) return endedBy(response, AbortSignal.abort(), () => {})
    const stream = new AbortController()
    const open = mcpStreams.get(given!) ?? new Set()
    mcpStreams.set(given!, open.add(stream))
    return endedBy(response, stream.signal, () => open.delete(stream))
  }

  const handle = async (request: Request, req: IncomingMessage): Promise<Response> => {
    const url = new URL(request.url)
    const path = url.pathname
    const member = memberOf(req)
    if ('status' in member) return problemResponse(member.status, member.message)
    const document = documentOf(req.headers, url)
    if (isMcp(path)) return serveMcp(request)
    if (path.startsWith(`${SERVER_PATH}/`)) return await serverRoute(request, path.slice(SERVER_PATH.length + 1), member, document, req)
    const target = pluginPath(path)
    if (!target) return problemResponse(404, 'not found')
    return await pluginRoute(request, target, member, document)
  }

  const serverRoute = async (request: Request, route: string, member: Member, document: string, req: IncomingMessage): Promise<Response> => {
    if (route === 'hello') return jsonResponse({ member, document })
    if (route === 'control') {
      if (request.method === 'GET') {
        const window = new URL(request.url).searchParams.get('window') || randomUUID()
        const stream = control.open(window, member, document)
        req.once('close', () => stream.close())
        return sseResponse(stream, request.signal)
      }
      if (request.method !== 'POST') return problemResponse(405, 'GET or POST')
      const limited = await limitBody(request, MAX_BODY)
      if (limited instanceof Response) return limited
      const body: unknown = await limited.json().catch(() => undefined)
      if (!isRecord(body)) return problemResponse(400, 'a JSON object')
      if (body.type === 'answer' && typeof body.id === 'string') {
        const status = control.answer(body.id, body.allow === true, member)
        return status === 200 ? jsonResponse({ ok: true }) : problemResponse(status, status === 404 ? 'no such approval' : 'this member may not answer this approval')
      }
      if (body.type === 'report' && typeof body.window === 'string') {
        const position = windowPosition(body.position)
        const ok = control.report(body.window, member, { position, role: typeof body.role === 'string' ? body.role : undefined, status: isRecord(body.status) ? body.status : undefined })
        return ok ? jsonResponse({ ok: true }) : problemResponse(404, 'unknown window')
      }
      return problemResponse(400, 'unknown message')
    }
    if (route === 'tokens') return await tokensRoute(request)
    if (route === 'focus') return await focusRoute(request, member)
    if (route === 'diagnostics' || route === 'diagnostics/events') return await diagnosticsRoute(request, route === 'diagnostics/events', req)
    return problemResponse(404, 'not found')
  }

  const tokensRoute = async (request: Request): Promise<Response> => {
    if (!serviceToken) return problemResponse(403, 'session tokens are issued only to the host that started this service (PRESMIUM_SERVICE_TOKEN)')
    if (!fromHost(request)) return problemResponse(401, 'session tokens need Authorization: Bearer <the service token>')
    const limited = await limitBody(request, MAX_BODY)
    if (limited instanceof Response) return limited
    const body: unknown = await limited.json().catch(() => ({}))
    const session = isRecord(body) && typeof body.session === 'string' && body.session !== '' ? body.session : undefined
    if (request.method === 'DELETE') {
      const revoked = session === undefined ? [...sessions.keys()] : sessions.has(session) ? [session] : []
      for (const id of revoked) {
        sessions.get(id)!.revoke()
        sessions.delete(id)
      }
      return jsonResponse({ revoked: revoked.length })
    }
    if (request.method !== 'POST') return problemResponse(405, 'POST or DELETE')
    if (!isRecord(body) || typeof body.document !== 'string' || session === undefined) return problemResponse(400, '{ document, session }')
    const document = body.document
    if (options.serverHost && !(await options.serverHost.documents()).some(doc => doc.dir === document)) return problemResponse(404, `no document ${JSON.stringify(document)}`)
    sessions.get(session)?.revoke()
    const grant = mcpEndpoint.issue(LOCAL_AUTHOR, 'author', { confirmed: true, document })
    sessions.set(session, grant)
    return jsonResponse({ url: grant.url, token: grant.token, document }, 201)
  }

  const focusRoute = async (request: Request, member: Member): Promise<Response> => {
    if (request.method === 'GET') {
      const params = new URL(request.url).searchParams
      const found = focus.get(params.has('document') ? params.get('document')! : undefined)
      return jsonResponse(found ? { document: found.document, focus: found.focus, reported: new Date(found.at).toISOString() } : { focus: null })
    }
    if (request.method !== 'POST') return problemResponse(405, 'GET or POST')
    if (serviceToken && !fromHost(request)) return problemResponse(401, 'a focus report needs Authorization: Bearer <the service token>')
    if (!options.serverHost) return problemResponse(409, 'this server compiles no document')
    const limited = await limitBody(request, MAX_BODY)
    if (limited instanceof Response) return limited
    const body = focusBody(await limited.json().catch(() => undefined))
    if (typeof body === 'string') return problemResponse(400, body)
    const workspaceFocus = body.focus.filter(report => report.scope === 'workspace')
    if (workspaceFocus.length && !hasRole(member, 'owner')) return problemResponse(403, 'workspace source selections need the owner role')
    if (workspaceFocus.length && !options.serverHost.readSource) return problemResponse(400, 'this host does not read workspace source selections')
    if (!(await options.serverHost.documents()).some(doc => doc.dir === body.document)) return problemResponse(404, `no document ${JSON.stringify(body.document)}`)
    try {
      const doc = body.focus.some(report => report.scope !== 'workspace') ? (await options.serverHost.compile(body.document)).doc : undefined
      const sources = new Map(await Promise.all(workspaceFocus.map(async report => {
        const path = report.source!.file
        return [path, (await options.serverHost!.readSource!(path, member)).content] as const
      })))
      const record = focus.report(body.document, doc, body.focus, path => sources.get(path)!)
      return jsonResponse({ document: record.document, focus: record.focus, reported: new Date(record.at).toISOString() })
    } catch (error) {
      return problemResponse(400, errorMessage(error))
    }
  }

  const diagnosticsRoute = async (request: Request, stream: boolean, req: IncomingMessage): Promise<Response> => {
    if (serviceToken && !fromHost(request)) return problemResponse(401, 'diagnostics need Authorization: Bearer <the service token>')
    if (!options.serverHost) return problemResponse(409, 'this server compiles no document')
    const params = new URL(request.url).searchParams
    if (request.method === 'GET') {
      const document = params.has('document') ? params.get('document')! : undefined
      if (document !== undefined) {
        if (!(await options.serverHost.documents()).some(doc => doc.dir === document)) return problemResponse(404, `no document ${JSON.stringify(document)}`)
        await mcpHost.diagnostics!(document)
      }
      if (!stream) return jsonResponse(diagnostics.snapshot(document))
      const connection = new AbortController()
      req.once('close', () => connection.abort())
      return sseResponse(diagnostics.events(document, AbortSignal.any([connection.signal, request.signal])), request.signal)
    }
    if (request.method !== 'POST' || stream) return problemResponse(405, stream ? 'GET' : 'GET or POST')
    const limited = await limitBody(request, MAX_BODY)
    if (limited instanceof Response) return limited
    const body: unknown = await limited.json().catch(() => undefined)
    const report = previewDiagnostics(body)
    if (typeof report === 'string') return problemResponse(400, report)
    if (!(await options.serverHost.documents()).some(doc => doc.dir === report.document)) return problemResponse(404, `no document ${JSON.stringify(report.document)}`)
    return jsonResponse({ accepted: diagnostics.report(report) })
  }

  const pluginRoute = async (request: Request, target: { plugin: string, path: string }, member: Member, document: string): Promise<Response> => {
    const known = await mount(document)
    if (!known) return problemResponse(404, `no document ${JSON.stringify(document)}`)
    const found = findRoute(known.contributions.get(target.plugin)?.routes, target.path)
    if (!found) return problemResponse(404, 'not found')
    const role = found.route.role ?? 'editor'
    if (!hasRole(member, role)) return problemResponse(403, `this route needs the role ${role}`)
    const limited = await limitBody(request, found.route.maxBody ?? MAX_BODY)
    if (limited instanceof Response) return limited
    try {
      const response = await found.route.handle(limited, { member, document, rest: found.rest })
      return response.headers.has('cache-control') ? response : withHeaders(response, { 'Cache-Control': 'no-store' })
    } catch (error) {
      log.error(`route ${target.plugin}/${target.path} failed: ${errorMessage(error)}`)
      return problemResponse(500, errorMessage(error))
    }
  }

  const proxy = createProxy()
  const server = nodeServer({ decide, decideUpgrade, fetch: handle, proxy })
  const port = await listen(server, options.port ?? (options.mode === 'dev' ? 0 : 4310), listenHost)
  url = `http://${urlHost(listenHost)}:${port}`
  log.debug(`listening at ${url}`)
  if (options.stateFile) {
    mkdirSync(dirname(options.stateFile), { recursive: true })
    writeFileSync(options.stateFile, `${JSON.stringify({ url, mcp: `${url}/mcp`, token, pid: process.pid }, null, 2)}\n`, { mode: 0o600 })
    chmodSync(options.stateFile, 0o600)
  }

  const takeDown = async (known: Promise<Mounted | undefined>) => {
    for (const [id, contribution] of (await known.catch(() => undefined))?.contributions ?? []) {
      try {
        await contribution.close?.()
      } catch (error) {
        log.error(`the contribution of ${id} failed to close: ${errorMessage(error)}`)
      }
    }
  }

  const unmount: PresmiumServer['unmount'] = async (dir, options = {}) => {
    if (!options.preserveFocus) focus.forget(dir)
    const known = mounted.get(dir)
    mounted.delete(dir)
    if (!known) return tearingDown.get(dir)
    log.debug(`unmounting the server contributions of ${dir || 'the deck'}`)
    const stopped = takeDown(known).finally(() => diagnostics.clear(dir, 'server'))
    tearingDown.set(dir, stopped)
    try {
      await stopped
    } finally {
      if (tearingDown.get(dir) === stopped) tearingDown.delete(dir)
    }
  }

  return {
    url,
    port,
    token,
    services,
    control,
    serverHost: options.serverHost,
    diagnostics,
    unmount,
    async close() {
      closing = true
      for (const grant of sessions.values()) grant.revoke()
      sessions.clear()
      control.close()
      await mcp?.close().catch((error: unknown) => log.error(`MCP failed to close: ${errorMessage(error)}`))
      await Promise.all([...mounted.keys()].map(dir => unmount(dir)))
      await Promise.all(tearingDown.values())
      proxy.close()
      await closeServer(server)
    },
  }
}

function previewDiagnostics(body: unknown): PreviewDiagnostics | string {
  if (!isRecord(body) || typeof body.document !== 'string' || (body.renderer !== 'web' && body.renderer !== 'slides') || typeof body.instance !== 'string' || !body.instance || typeof body.revision !== 'string' || !Array.isArray(body.findings)) return 'a preview diagnostic report needs document, renderer, instance, revision and findings'
  const findings: Finding[] = []
  for (const item of body.findings) {
    if (!isRecord(item) || typeof item.checkId !== 'string' || typeof item.message !== 'string' || !['error', 'warning', 'info'].includes(String(item.severity))) return 'each diagnostic needs checkId, severity and message'
    if (item.hint !== undefined && typeof item.hint !== 'string') return 'a diagnostic hint must be text'
    if (item.source !== undefined && (!isRecord(item.source) || typeof item.source.file !== 'string' || (item.source.line !== undefined && (!Number.isInteger(item.source.line) || Number(item.source.line) < 1)))) return 'a diagnostic source needs a file and an optional positive line'
    findings.push({ checkId: item.checkId, severity: item.severity as Finding['severity'], message: item.message, ...item.hint ? { hint: item.hint as string } : {}, ...item.source ? { source: item.source as Finding['source'] } : {} })
  }
  return { document: body.document, renderer: body.renderer, instance: body.instance, revision: body.revision, findings }
}

function withHeaders(response: Response, headers: Record<string, string>): Response {
  for (const [name, value] of Object.entries(headers)) {
    try {
      response.headers.set(name, value)
    } catch {
      const copy = new Response(response.body, response)
      for (const [n, v] of Object.entries(headers)) copy.headers.set(n, v)
      return copy
    }
  }
  return response
}

function windowPosition(value: unknown): WindowPosition | undefined {
  if (!isRecord(value) || typeof value.slide !== 'number' || typeof value.step !== 'number') return undefined
  const { trail } = value
  return {
    slide: value.slide,
    step: value.step,
    ...typeof value.view === 'string' ? { view: value.view } : {},
    ...typeof value.section === 'string' ? { section: value.section } : {},
    ...Array.isArray(trail) && trail.length <= 10_000 && trail.every(key => typeof key === 'string') ? { trail: trail as string[] } : {},
  }
}
