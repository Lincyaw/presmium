/**
 * The server of `presmium dev` and `presmium serve` (docs/architecture.md
 * section 10): the plugins' contributions under `/__presmium/<plugin id>/`,
 * the handshake and control channel under `/__presmium/presmium.server/`,
 * the MCP mount point `/mcp`, and in `serve` mode the rest forwarded to the
 * workspace site. It listens on this machine only and serves the one user
 * there: `Host` and `Origin` must name this machine, and the one member is
 * the local author (owner).
 */
import { randomBytes, randomUUID } from 'node:crypto'
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs'
import type { IncomingMessage } from 'node:http'
import { dirname } from 'node:path'
import { APPROVALS, eventStream, isRecord, MAX_BODY, MCP_ENDPOINT, errorMessage, prefixed } from '@presmium/kernel'
import type {
  AgentMode,
  ApprovalKind,
  Logger,
  McpEndpoint,
  Member,
  ProxySpec,
  Route,
  ServerContext,
  ServerContribution,
  ServiceToken,
} from '@presmium/kernel'
import { pluginLogger } from '@presmium/compiler'
import { createPresmiumMcp } from '@presmium/mcp'
import { authenticate, LOCAL_AUTHOR } from './auth.ts'
import type { Refusal } from './auth.ts'
import { Control, hasRole } from './control.ts'
import type { ApprovalPolicy, WindowPosition } from './control.ts'
import type { ServedDocument, ServerHost } from './host.ts'
import { bearer, closeServer, createProxy, header, isLoopback, json, limitBody, listen, nodeServer, problem, urlHost } from './http.ts'
import type { Decision, ProxyTarget } from './http.ts'
import { serverMcpHost } from './mcp.ts'

export { LOCAL_AUTHOR }

/** The server's own routes. */
export const SERVER_PATH = '/__presmium/presmium.server'

/** The MCP mount point and the paths under it. */
function isMcp(path: string): boolean {
  return path === '/mcp' || path.startsWith('/mcp/')
}

/**
 * A response whose body ends when `signal` aborts: an MCP subscription stream
 * (`subscriptions/listen`) of a token that was revoked. The stream it passes
 * on is cancelled, so the MCP service drops the subscription; `done` is called
 * once the body ended either way.
 */
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
  /** `dev`: one deck. `serve`: a workspace. */
  mode: 'dev' | 'serve'
  /** Listening address, an address of this machine; default `127.0.0.1`. */
  host?: string
  /** Default: a free port in `dev`, 4310 in `serve`. */
  port?: number
  /** The document of a directory (relative to the workspace root; '' in `dev`), its contributions made on its first request; undefined when there is none. */
  document(dir: string): Promise<ServedDocument | undefined>
  /** The host process's operations (compile, check, build, run), for the control channel and MCP. */
  serverHost?: ServerHost
  /** The operator's settings by plugin id (`ServerContext.settings`). */
  settings?: Record<string, Record<string, unknown>>
  /** The approval policy by kind: `presmium dev --allow`, or the workspace's `approvals`; default `ask`. */
  approvals?: Partial<Record<ApprovalKind, ApprovalPolicy>>
  /** `serve`: where the other paths go (the workspace site), HTTP and WebSocket. */
  forward?(): string | undefined
  /** The operator directory (`ServerContext.operatorDir`). */
  operatorDir?: string
  /** `dev`: where the per-process token is written (`<deck>/.presmium/server.json`, mode 0600). */
  stateFile?: string
  /**
   * Another MCP service behind `/mcp`; by default `@presmium/mcp` over the
   * `serverHost`, the control channel and the approvals (WP-78).
   */
  mcp?(request: Request, access: { member: Member, mode: AgentMode }): Promise<Response>
  /** The process's environment (`ServerContext.secret`); default `process.env`. */
  env?: NodeJS.ProcessEnv
  /** How long an approval waits for an answer; default 50 s. */
  approvalTimeoutMs?: number
  log?: Logger
}

export interface PresmiumServer {
  /** The server's address, e.g. `http://127.0.0.1:43123`. */
  url: string
  port: number
  /** `dev`: the per-process MCP token (also in `stateFile`). */
  token?: string
  /** The server's Node services (`APPROVALS`, `MCP_ENDPOINT`), for the compiler of the documents (`CompilerOptions.services`). */
  services: [ServiceToken<unknown>, unknown][]
  control: Control
  serverHost?: ServerHost
  /**
   * Takes a document's server contributions down (F-40): their `close()`
   * runs, and the document is loaded again (with its configuration then) on
   * its next request. The workspace calls it when a document is deleted,
   * renamed or made again.
   */
  unmount(dir: string): Promise<void>
  close(): Promise<void>
}

interface Mounted {
  doc: ServedDocument
  contributions: Map<string, ServerContribution>
}

/**
 * The plugin id and the path after it of `/__presmium/<plugin id>/<path>`:
 * `path` decoded, `raw` as the request has it (what a proxy passes on), and
 * `plain` false when a decoded part is `.` or `..` or the path holds an
 * encoded separator, so that it could reach outside the route or the proxy's
 * target (WP-91).
 */
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

/** The route a path takes: an exact key, or the longest `<prefix>/*` key, with the rest. */
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

/**
 * Why the server does not listen on `host`: it serves the one user of this
 * machine (docs/requirements.md, 定位与边界); undefined for an address of this
 * machine.
 */
function remoteHost(mode: ServerOptions['mode'], host: string): string | undefined {
  // `::1` as a listening address is written without brackets.
  if (isLoopback(host.includes(':') && !host.startsWith('[') ? `[${host}]` : host)) return undefined
  return `presmium ${mode} listens on this machine only, not on ${host}: it serves the one user who runs it. To use it from another machine, forward its port over SSH (ssh -L 4310:127.0.0.1:4310 <this machine>); for several people, give each one a workspace of their own (the hub template)`
}

export async function startServer(options: ServerOptions): Promise<PresmiumServer> {
  const env = options.env ?? process.env
  // On stderr, so a command's stdout stays its output; debug lines with PRESMIUM_DEBUG.
  const log = options.log ?? pluginLogger('presmium server')
  const listenHost = options.host ?? '127.0.0.1'
  const refused = remoteHost(options.mode, listenHost)
  if (refused) throw new Error(refused)

  const control = new Control({
    policy: options.approvals ?? {},
    timeoutMs: options.approvalTimeoutMs,
  })
  const token = options.mode === 'dev' ? randomBytes(24).toString('base64url') : undefined
  const mcpTokens = new Map<string, { member: Member, mode: AgentMode }>()
  /** The open responses of each issued token (subscription streams), ended when it is revoked. */
  const mcpStreams = new Map<string, Set<AbortController>>()
  let url = ''
  const mcpEndpoint: McpEndpoint = {
    issue(member, mode) {
      const value = randomBytes(24).toString('base64url')
      mcpTokens.set(value, { member, mode })
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
  const own = new Map(services.map(([token, impl]) => [token.id, impl]))

  // Documents and their contributions, made on the first request of each.
  const mounted = new Map<string, Promise<Mounted | undefined>>()
  const mount = (dir: string) => {
    let known = mounted.get(dir)
    if (!known) {
      known = (async () => {
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
            log: prefixed(log, id),
          }
          try {
            contributions.set(id, await plugin.server.call(plugin, ctx))
          } catch (error) {
            log.error(`plugin ${id} failed to make its server contribution: ${errorMessage(error)}`)
          }
        }
        return { doc, contributions }
      })()
      // A document that failed to load (a compilation error of the host), or was not there yet, is tried again on its next request.
      const loading = known
      loading.then((found) => {
        if (!found && mounted.get(dir) === loading) mounted.delete(dir)
      }, () => mounted.delete(dir))
      mounted.set(dir, known)
    }
    return known
  }

  // MCP at /mcp: the documents and operations of the host, the windows and the approvals (10.2).
  const mcp = options.mcp ? undefined : createPresmiumMcp(serverMcpHost({
    serverHost: options.serverHost,
    control,
    command: options.mode,
    mount: async dir => (await mount(dir))?.doc,
    mounted: async () => (await Promise.all([...mounted.values()].map(known => known.catch(() => undefined)))).flatMap(m => (m ? [m.doc] : [])),
    service: <T>(token: ServiceToken<T>) => own.get(token.id) as T | undefined,
  }))

  /** Who sent a request, or why it is refused; decided once per request. */
  const members = new WeakMap<IncomingMessage, Member | Refusal>()
  const memberOf = (req: IncomingMessage): Member | Refusal => {
    let found = members.get(req)
    if (!found) members.set(req, found = authenticate(req))
    return found
  }

  const refuse = (refusal: Refusal): Decision => ({ kind: 'answer', response: problem(refusal.status, refusal.message) })

  const decide = async (req: IncomingMessage): Promise<Decision> => {
    const url = new URL(req.url ?? '/', 'http://presmium')
    const path = url.pathname
    const member = memberOf(req)
    if ('status' in member) return refuse(member)
    const target = pluginPath(path)
    // A route's or a proxy's path stays under it: no `.` or `..` part, no encoded separator (WP-91).
    if (target && !target.plain) return refuse({ status: 400, message: 'a path with a . or .. part or an encoded separator' })
    if (isMcp(path)) return { kind: 'fetch' }
    if (target) {
      if (target.plugin === 'presmium.server') return { kind: 'fetch' }
      const proxy = await proxyOf(target, documentOf(req.headers, url), member, url.search)
      return proxy ?? { kind: 'fetch' }
    }
    const forward = options.mode === 'serve' ? options.forward?.() : undefined
    if (!forward) return { kind: 'answer', response: problem(404, 'not found') }
    return { kind: 'proxy', to: { target: forward, path: req.url ?? '/' } }
  }

  /** A plugin's proxy for the path, when one matches and the member may use it. */
  const proxyOf = async (target: { plugin: string, path: string, raw: string }, dir: string, member: Member, search: string): Promise<Decision | undefined> => {
    const contribution = (await mount(dir))?.contributions.get(target.plugin)
    const found = findProxy(contribution?.proxies, target.path)
    if (!found) return undefined
    const role = found.spec.role ?? 'editor'
    if (!hasRole(member, role)) return refuse({ status: 403, message: `this proxy needs the role ${role}` })
    // The rest of the path as the request has it (a plain path: its parts are the decoded path's).
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

  /** `/mcp`: the caller its bearer token names; a subscription stream of an issued token ends when the token is revoked. */
  const serveMcp = async (request: Request): Promise<Response> => {
    const given = bearer(request.headers.get('authorization'))
    const access = given === undefined ? undefined : given === token ? { member: LOCAL_AUTHOR, mode: 'author' as const } : mcpTokens.get(given)
    if (!access) return problem(401, 'MCP needs an Authorization: Bearer token')
    const limited = await limitBody(request, MAX_BODY)
    if (limited instanceof Response) return limited
    request = limited
    const response = await (options.mcp ? options.mcp(request, access) : mcp!.fetch(request, access))
    if (given === token || !response.headers.get('content-type')?.startsWith('text/event-stream')) return response
    // Revoked while the request was answered: the stream ends at once.
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
    if ('status' in member) return problem(member.status, member.message)
    const document = documentOf(req.headers, url)
    if (isMcp(path)) return serveMcp(request)
    if (path.startsWith(`${SERVER_PATH}/`)) return await serverRoute(request, path.slice(SERVER_PATH.length + 1), member, document, req)
    const target = pluginPath(path)
    if (!target) return problem(404, 'not found')
    return await pluginRoute(request, target, member, document)
  }

  const serverRoute = async (request: Request, route: string, member: Member, document: string, req: IncomingMessage): Promise<Response> => {
    if (route === 'hello') return json({ member, document })
    if (route === 'control') {
      if (request.method === 'GET') {
        const window = new URL(request.url).searchParams.get('window') || randomUUID()
        const stream = control.open(window, member, document)
        req.once('close', () => stream.close())
        return eventStream(stream, request.signal)
      }
      if (request.method !== 'POST') return problem(405, 'GET or POST')
      const limited = await limitBody(request, MAX_BODY)
      if (limited instanceof Response) return limited
      const body: unknown = await limited.json().catch(() => undefined)
      if (!isRecord(body)) return problem(400, 'a JSON object')
      if (body.type === 'answer' && typeof body.id === 'string') {
        const status = control.answer(body.id, body.allow === true, member)
        return status === 200 ? json({ ok: true }) : problem(status, status === 404 ? 'no such approval' : 'this member may not answer this approval')
      }
      if (body.type === 'report' && typeof body.window === 'string') {
        const position = windowPosition(body.position)
        const ok = control.report(body.window, member, { position, role: typeof body.role === 'string' ? body.role : undefined, status: isRecord(body.status) ? body.status : undefined })
        return ok ? json({ ok: true }) : problem(404, 'unknown window')
      }
      return problem(400, 'unknown message')
    }
    return problem(404, 'not found')
  }

  const pluginRoute = async (request: Request, target: { plugin: string, path: string }, member: Member, document: string): Promise<Response> => {
    const known = await mount(document)
    if (!known) return problem(404, `no document ${JSON.stringify(document)}`)
    const found = findRoute(known.contributions.get(target.plugin)?.routes, target.path)
    if (!found) return problem(404, 'not found')
    const role = found.route.role ?? 'editor'
    if (!hasRole(member, role)) return problem(403, `this route needs the role ${role}`)
    // The body is read before the route runs, at most as large as the route takes (N-08).
    const limited = await limitBody(request, found.route.maxBody ?? MAX_BODY)
    if (limited instanceof Response) return limited
    try {
      const response = await found.route.handle(limited, { member, document, rest: found.rest })
      // What a route answers is the member's: not cached unless the route says how (F-33).
      return response.headers.has('cache-control') ? response : withHeaders(response, { 'Cache-Control': 'no-store' })
    } catch (error) {
      log.error(`route ${target.plugin}/${target.path} failed: ${errorMessage(error)}`)
      return problem(500, errorMessage(error))
    }
  }

  const proxy = createProxy()
  const server = nodeServer({ decide, decideUpgrade, fetch: handle, proxy })
  const port = await listen(server, options.port ?? (options.mode === 'dev' ? 0 : 4310), listenHost)
  url = `http://${urlHost(listenHost)}:${port}`
  log.debug(`listening at ${url}`)
  if (token && options.stateFile) {
    mkdirSync(dirname(options.stateFile), { recursive: true })
    writeFileSync(options.stateFile, `${JSON.stringify({ url, mcp: `${url}/mcp`, token, pid: process.pid }, null, 2)}\n`, { mode: 0o600 })
    chmodSync(options.stateFile, 0o600)
  }

  /** A mounted document's contributions closed (`close()`). */
  const takeDown = async (known: Promise<Mounted | undefined>) => {
    for (const [id, contribution] of (await known.catch(() => undefined))?.contributions ?? []) {
      await Promise.resolve(contribution.close?.()).catch((error: unknown) => log.error(`the contribution of ${id} failed to close: ${errorMessage(error)}`))
    }
  }

  return {
    url,
    port,
    token,
    services,
    control,
    serverHost: options.serverHost,
    async unmount(dir) {
      const known = mounted.get(dir)
      // The next request loads the document again, as it is then.
      mounted.delete(dir)
      if (known) {
        log.debug(`unmounting the server contributions of ${dir || 'the deck'}`)
        await takeDown(known)
      }
    },
    async close() {
      // Waiting approvals are refused first, so the MCP calls that wait for them end.
      control.close()
      await mcp?.close().catch((error: unknown) => log.error(`MCP failed to close: ${errorMessage(error)}`))
      for (const known of mounted.values()) await takeDown(known)
      proxy.close()
      await closeServer(server)
    },
  }
}

function withHeaders(response: Response, headers: Record<string, string>): Response {
  for (const [name, value] of Object.entries(headers)) {
    try {
      response.headers.set(name, value)
    } catch {
      // Immutable headers (a fetched response passed on): copied.
      const copy = new Response(response.body, response)
      for (const [n, v] of Object.entries(headers)) copy.headers.set(n, v)
      return copy
    }
  }
  return response
}

/** The position a window reports, as far as it is well formed: its section number and step, its view and section id. */
function windowPosition(value: unknown): WindowPosition | undefined {
  if (!isRecord(value) || typeof value.slide !== 'number' || typeof value.step !== 'number') return undefined
  return {
    slide: value.slide,
    step: value.step,
    ...typeof value.view === 'string' ? { view: value.view } : {},
    ...typeof value.section === 'string' ? { section: value.section } : {},
  }
}
