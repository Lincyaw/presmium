import { chmodSync, mkdirSync, writeFileSync } from 'node:fs'
import type { IncomingMessage } from 'node:http'
import { dirname } from 'node:path'
import { APPROVALS, errorMessage, hasRole, MAX_BODY, MCP_ENDPOINT, problemResponse } from '@lincyaw/kernel'
import type { ApprovalKind, Logger, Member, ProxySpec, Route, ServiceToken } from '@lincyaw/kernel'
import { pluginLogger } from '@lincyaw/compiler'
import { createPresmiumMcp } from '@lincyaw/mcp'
import type { McpCaller } from '@lincyaw/mcp'
import { authenticate, machineHosts } from './auth.ts'
import type { Refusal } from './auth.ts'
import { ControlChannel } from './control.ts'
import type { ApprovalPolicy } from './control.ts'
import { FocusStore } from './focus.ts'
import { DiagnosticStore } from './diagnostics.ts'
import { bearer, createProxy, header, isLoopback, limitBody, listen, nodeServer, urlHost } from './http.ts'
import type { Decision, ProxyTarget } from './http.ts'
import { McpTokens } from './mcp-access.ts'
import { serverMcpHost } from './mcp-host.ts'
import { Mounts } from './mounts.ts'
import { createServerRouteHandler, SERVER_PATH } from './server-routes.ts'
import type { ServedDocument, ServerHost } from './server-host.ts'

function isMcp(path: string): boolean {
  return path === '/mcp' || path.startsWith('/mcp/')
}

export interface ServerOptions {
  mode: 'dev' | 'serve'
  listenAddress?: string
  port?: number
  document(dir: string): Promise<ServedDocument | undefined>
  serverHost?: ServerHost
  settings?: Record<string, Record<string, unknown>>
  approvals?: Partial<Record<ApprovalKind, ApprovalPolicy>>
  /** The origin to forward a path of the site to (in `serve`): the dev server that serves it. */
  forward?(path: string): string | undefined | Promise<string | undefined>
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
  mcpToken: string
  services: [ServiceToken<unknown>, unknown][]
  control: ControlChannel
  diagnostics: DiagnosticStore
  serverHost?: ServerHost
  unmount(dir: string, options?: { preserveFocus?: boolean }): Promise<void>
  close(): Promise<void>
}

function parsePluginPath(pathname: string): { plugin: string, path: string, raw: string, plain: boolean } | undefined {
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

function requestedDocument(headers: IncomingMessage['headers'], url: URL): string {
  const value = header(headers, 'presmium-document') ?? url.searchParams.get('document') ?? ''
  try {
    return decodeURIComponent(value).replace(/^\/+|\/+$/g, '')
  } catch {
    return value
  }
}

function remoteListenRefusal(mode: ServerOptions['mode'], listenAddress: string, port: number | undefined): string | undefined {
  if (mode === 'serve' || isLoopback(listenAddress)) return undefined
  const at = port || 'its port'
  return `presmium ${mode} listens on this machine only, not on ${listenAddress}: it serves the one user who runs it. To use it from another machine, forward its port over SSH (ssh -L ${at}:127.0.0.1:${at} <this machine>), or use presmium serve --host`
}

export async function startServer(options: ServerOptions): Promise<PresmiumServer> {
  const env = options.env ?? process.env
  const log = options.log ?? pluginLogger('presmium server')
  const listenAddress = options.listenAddress ?? '127.0.0.1'
  const refused = remoteListenRefusal(options.mode, listenAddress, options.port)
  if (refused) throw new Error(refused)
  const local = machineHosts(listenAddress)

  const control = new ControlChannel({
    policy: options.approvals ?? {},
    timeoutMs: options.approvalTimeoutMs,
  })
  let url = ''
  const mcpTokens = new McpTokens(() => url)
  const services: [ServiceToken<unknown>, unknown][] = [[APPROVALS, control.approvals], [MCP_ENDPOINT, mcpTokens.endpoint]]
  const ownServices = new Map(services.map(([token, implementation]) => [token.id, implementation]))
  const ownService = <T>(token: ServiceToken<T>) => ownServices.get(token.id) as T | undefined
  const focus = new FocusStore()
  const diagnostics = options.diagnostics ?? new DiagnosticStore()
  const mounts = new Mounts({ document: options.document, ownService, settings: options.settings, operatorDir: options.operatorDir, env, diagnostics, log })

  const mcpHost = serverMcpHost({
    serverHost: options.serverHost,
    control,
    command: options.mode,
    mount: async dir => (await mounts.mount(dir))?.doc,
    mounted: () => mounts.documents(),
    service: ownService,
    focus,
    diagnostics,
  })
  const mcp = options.mcp ? undefined : createPresmiumMcp(mcpHost)
  const serverRoute = createServerRouteHandler({ control, mcpTokens, focus, diagnostics, mcpHost, serverHost: options.serverHost, launcherToken: env.PRESMIUM_SERVICE_TOKEN || undefined })

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
    const target = parsePluginPath(path)
    if (target && !target.plain) return refuse({ status: 400, message: 'a path with a . or .. part or an encoded separator' })
    if (isMcp(path)) return { kind: 'fetch' }
    if (target) {
      if (target.plugin === 'presmium.server') return { kind: 'fetch' }
      if (findRoute(options.serverHost?.routes?.[target.plugin], target.path)) return { kind: 'fetch' }
      const proxy = await proxyOf(target, requestedDocument(req.headers, url), member, url.search)
      return proxy ?? { kind: 'fetch' }
    }
    const forward = options.mode === 'serve' ? await options.forward?.(path) : undefined
    if (!forward) return { kind: 'answer', response: problemResponse(404, 'not found') }
    const site = new URL(forward)
    const lan = !isLoopback(header(req.headers, 'host'))
    const headers = lan ? { host: site.host, ...header(req.headers, 'origin') ? { origin: site.origin } : {} } : undefined
    return { kind: 'proxy', to: { target: forward, path: req.url ?? '/', ...headers ? { headers } : {} } }
  }

  const proxyOf = async (target: { plugin: string, path: string, raw: string }, dir: string, member: Member, search: string): Promise<Decision | undefined> => {
    const contribution = (await mounts.mount(dir))?.contributions.get(target.plugin)
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
    const caller = mcpTokens.callerOf(given)
    if (!caller) return problemResponse(401, 'MCP needs an Authorization: Bearer token')
    const limited = await limitBody(request, MAX_BODY)
    if (limited instanceof Response) return limited
    const response = await (options.mcp ? options.mcp(limited, caller) : mcp!.fetch(limited, caller))
    return mcpTokens.tieToGrant(given!, response)
  }

  const pluginRoute = async (request: Request, target: { plugin: string, path: string }, member: Member, document: string): Promise<Response> => {
    let found = findRoute(options.serverHost?.routes?.[target.plugin], target.path)
    if (!found) {
      const known = await mounts.mount(document)
      if (!known) return problemResponse(404, `no document ${JSON.stringify(document)}`)
      found = findRoute(known.contributions.get(target.plugin)?.routes, target.path)
    }
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

  const handle = async (request: Request, req: IncomingMessage): Promise<Response> => {
    const url = new URL(request.url)
    const path = url.pathname
    const member = memberOf(req)
    if ('status' in member) return problemResponse(member.status, member.message)
    const document = requestedDocument(req.headers, url)
    if (isMcp(path)) return serveMcp(request)
    if (path.startsWith(`${SERVER_PATH}/`)) return await serverRoute(request, path.slice(SERVER_PATH.length + 1), { member, document, req })
    const target = parsePluginPath(path)
    if (!target) return problemResponse(404, 'not found')
    return await pluginRoute(request, target, member, document)
  }

  const proxy = createProxy()
  const http = nodeServer({ decide, decideUpgrade, fetch: handle, proxy })
  let closing: Promise<void> | undefined
  const close = (): Promise<void> => closing ??= Promise.resolve().then(async () => {
    mounts.stop()
    mcpTokens.revokeAgentSessions()
    control.close()
    await mcp?.close().catch((error: unknown) => log.error(`MCP failed to close: ${errorMessage(error)}`))
    try {
      await mounts.close()
    } finally {
      try { proxy.close() }
      finally { await http.close() }
    }
  })
  let port: number
  try {
    port = await listen(http.server, options.port ?? (options.mode === 'dev' ? 0 : 4310), listenAddress)
    url = `http://${urlHost(listenAddress)}:${port}`
    log.debug(`listening at ${url}`)
    if (options.stateFile) {
      mkdirSync(dirname(options.stateFile), { recursive: true })
      writeFileSync(options.stateFile, `${JSON.stringify({ url, mcp: `${url}/mcp`, token: mcpTokens.processMcpToken, pid: process.pid }, null, 2)}\n`, { mode: 0o600 })
      chmodSync(options.stateFile, 0o600)
    }
  } catch (error) {
    await close().catch((cleanup: unknown) => log.error(`the server failed to close after startup failed: ${errorMessage(cleanup)}`))
    throw error
  }

  return {
    url,
    port,
    mcpToken: mcpTokens.processMcpToken,
    services,
    control,
    serverHost: options.serverHost,
    diagnostics,
    async unmount(dir, unmountOptions = {}) {
      if (!unmountOptions.preserveFocus) focus.forget(dir)
      await mounts.unmount(dir)
    },
    close,
  }
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
