/**
 * The server of `presmium dev` and `presmium serve` (docs/architecture.md
 * section 10): the plugins' contributions under `/__presmium/<plugin id>/`,
 * the handshake and control channel under `/__presmium/presmium.server/`,
 * the MCP mount point `/mcp`, and in `serve` mode the rest forwarded to the
 * workspace site by member.
 *
 * `dev` (and a `serve` without a login): LOCAL mode, on this machine only;
 * `Host` and `Origin` must name it, the one member is the local author
 * (owner). `serve` with a login proxy (a shared secret or trusted
 * addresses): SHARED mode; members come from the proxy's headers, the owner
 * console has a host name of its own, and the server refuses to start
 * without the gateway, agent-host and console or with third-party credentials.
 */
import { randomBytes, randomUUID } from 'node:crypto'
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs'
import type { IncomingMessage } from 'node:http'
import { dirname } from 'node:path'
import { APPROVALS, eventStream, isRecord, MCP_ENDPOINT, errorMessage } from '@presmium/kernel'
import type {
  AgentMode,
  ApprovalKind,
  GatewayAccess,
  Logger,
  McpEndpoint,
  Member,
  MemberRole,
  ProxySpec,
  Route,
  ServerContext,
  ServerContribution,
  ServiceToken,
  TrustMode,
} from '@presmium/kernel'
import { createPresmiumMcp } from '@presmium/mcp'
import { CONSOLE_HEADER, CONSOLE_HEADERS, CONSOLE_SCRIPT, CONSOLE_SCRIPT_PATH, consolePage } from './console.ts'
import { Control, hasRole } from './control.ts'
import type { ApprovalPolicy, WindowPosition } from './control.ts'
import type { ServedDocument, ServerHost } from './host.ts'
import { bearer, closeServer, createProxy, header, hostname, isLoopback, json, listen, nodeServer, originHost, problem, sameSecret, urlHost } from './http.ts'
import type { Decision, ProxyTarget } from './http.ts'
import { serverMcpHost } from './mcp.ts'
import { dropPrivileges, ownSecret, sharedSetup } from './trust.ts'
import type { SharedSetup } from './trust.ts'

/** The server's own routes. */
export const SERVER_PATH = '/__presmium/presmium.server'

/** Headers serve does not pass on to proxies and the site: the login proxy's secret. */
const PROXY_STRIP = ['x-presmium-proxy-secret']

/**
 * SHARED mode (WP-91): what the login proxy passes besides, which no proxy
 * target and not the site (in agent-host, the sandbox) gets: the member's
 * session cookie, the identity provider's tokens and the identity headers.
 * A response of theirs sets no cookie in the member's browser either.
 */
const CREDENTIAL_STRIP = [...PROXY_STRIP, 'cookie', 'authorization', 'proxy-authorization', 'x-forwarded-user', 'x-forwarded-email', 'x-forwarded-preferred-username', 'x-forwarded-groups', 'x-forwarded-access-token', 'x-forwarded-id-token']
const RESPONSE_STRIP = ['set-cookie']

/**
 * Headers serve does not pass on to the gateway (a plugin's proxy to
 * `ServerContext.gateway`, e.g. a Jupyter environment of `auth: proxy`): the
 * gateway takes no request that carries the browser's `Origin` (10.9).
 */
const GATEWAY_STRIP = [...CREDENTIAL_STRIP, 'origin']

/** The MCP mount point and the paths under it. */
function isMcp(path: string): boolean {
  return path === '/mcp' || path.startsWith('/mcp/')
}

/** Whether `target` is the gateway: the same origin as its address. */
function sameOrigin(target: string, gateway: string): boolean {
  try {
    return new URL(target).origin === new URL(gateway).origin
  } catch {
    return false
  }
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

/** The identity a login proxy passes (oauth2-proxy's headers). */
export interface Identity {
  user?: string
  email?: string
  name?: string
  groups: string[]
}

/** The member who uses `presmium dev`, or a `presmium serve` without a login. */
export const LOCAL_AUTHOR: Member = { id: 'local', name: 'local author', roles: ['owner'] }

export interface ServerOptions {
  /** `dev`: one deck, this machine only. `serve`: a workspace, LOCAL without a login, SHARED with one. */
  mode: 'dev' | 'serve'
  /** Listening address; default `127.0.0.1`. A `serve` on another address needs a login proxy. */
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
  /** `serve`: addresses whose requests are trusted as coming from the login proxy (`--trust-proxy-from`). */
  trustProxyFrom?: string[]
  /** `serve` with a login: the roles of a member, from the workspace's `members`; default reader. */
  roles?(identity: Identity): MemberRole[]
  /** `serve`: where the other paths of a member go (the workspace site of the member's view), HTTP and WebSocket. */
  forward?(member: Member): string | undefined
  /** The LOCAL operator directory (`ServerContext.operatorDir`). */
  operatorDir?: string
  /** `serve` started as root: the user to become once the token files are read (`--user`). */
  user?: string
  /** `dev`: where the per-process token is written (`<deck>/.presmium/server.json`, mode 0600). */
  stateFile?: string
  /**
   * Another MCP service behind `/mcp`; by default `@presmium/mcp` over the
   * `serverHost`, the control channel and the approvals (WP-78).
   */
  mcp?(request: Request, access: { member: Member, mode: AgentMode }): Promise<Response>
  /** The process's environment (SHARED's checks, `secret`); default `process.env`. */
  env?: NodeJS.ProcessEnv
  /** How long an approval waits for an answer; default 50 s. */
  approvalTimeoutMs?: number
  log?: Logger
}

export interface PresmiumServer {
  /** The server's address, e.g. `http://127.0.0.1:43123`. */
  url: string
  port: number
  trust: TrustMode
  /** `dev`: the per-process MCP token (also in `stateFile`). */
  token?: string
  /** The server's Node services (`APPROVALS`, `MCP_ENDPOINT`), for the compiler of the documents (`CompilerOptions.services`). */
  services: [ServiceToken<unknown>, unknown][]
  control: Control
  serverHost?: ServerHost
  /** SHARED mode: the gateway access with serve's service token. */
  gateway?: GatewayAccess
  /** SHARED mode: agent-host's address and token, read with the other secrets, once (the workspace's client). */
  agentHost?: GatewayAccess
  close(): Promise<void>
}

interface Auth {
  member: Member
  /** The request came to the owner console's host name. */
  console: boolean
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

/** The plugin a proxy to the gateway reaches: the first part of its target's path (`<gateway>/<plugin id>/…`). */
function gatewayPlugin(target: string): string | undefined {
  try {
    return new URL(target).pathname.split('/').find(Boolean)
  } catch {
    return undefined
  }
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

/** The default logger: stderr, so a command's stdout stays its output. */
const STDERR: Logger = {
  debug: () => {},
  info: (...args) => console.error('[presmium server]', ...args),
  warn: (...args) => console.error('[presmium server]', ...args),
  error: (...args) => console.error('[presmium server]', ...args),
}

export async function startServer(options: ServerOptions): Promise<PresmiumServer> {
  const env = options.env ?? process.env
  const log = options.log ?? STDERR
  const listenHost = options.host ?? '127.0.0.1'
  const login = options.mode === 'serve' && Boolean(env.PRESMIUM_PROXY_SECRET || env.PRESMIUM_PROXY_SECRET_FILE || options.trustProxyFrom?.length)
  if (options.mode === 'serve' && !login && !isLoopback(listenHost)) {
    throw new Error(`presmium serve listens on ${listenHost}, beyond this machine, only behind a login proxy: set PRESMIUM_PROXY_SECRET (or PRESMIUM_PROXY_SECRET_FILE) or --trust-proxy-from`)
  }
  // The one place serve reads its secrets: once, before it drops privileges; started as root, from their files only (WP-91).
  const asRoot = Boolean(options.user) && process.getuid?.() === 0
  const shared: SharedSetup | undefined = login ? sharedSetup(env, asRoot) : undefined
  // The token files are read: from here on the process runs as the unprivileged user.
  dropPrivileges(options.user)
  const trust: TrustMode = shared ? 'shared' : 'local'
  const consoleHost = shared?.consoleHost
  const trusted = new Set(options.trustProxyFrom ?? [])

  const control = new Control({
    shared: Boolean(shared),
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
        // The agent reaches serve's /mcp through the gateway in SHARED mode (10.9).
        url: shared ? `${shared.gateway.url.replace(/\/$/, '')}/mcp` : `${url}/mcp`,
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
  /** The documents loaded so far, for their operator settings. */
  const loaded = new Map<string, ServedDocument>()
  const mount = (dir: string) => {
    let known = mounted.get(dir)
    if (!known) {
      known = (async () => {
        const doc = await options.document(dir)
        if (!doc) return undefined
        loaded.set(dir, doc)
        const contributions = new Map<string, ServerContribution>()
        for (const { id, plugin, config } of doc.plugins) {
          if (!plugin.server) continue
          const ctx: ServerContext = {
            deckDir: doc.deckDir,
            workspaceRoot: doc.workspaceRoot,
            config,
            settings: (options.settings ?? doc.settings)?.[id] ?? {},
            lang: doc.lang,
            trust,
            service: <T>(token: ServiceToken<T>) => (own.get(token.id) as T | undefined) ?? doc.service(token),
            secret: name => (ownSecret(name) ? undefined : env[name]),
            ...shared ? { gateway: shared.gateway } : {},
            ...!shared && (options.operatorDir ?? doc.operatorDir) ? { operatorDir: options.operatorDir ?? doc.operatorDir } : {},
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
    shared: Boolean(shared),
    settings: dir => options.settings ?? loaded.get(dir)?.settings,
    mount: async dir => (await mount(dir))?.doc,
    mounted: async () => (await Promise.all([...mounted.values()].map(known => known.catch(() => undefined)))).flatMap(m => (m ? [m.doc] : [])),
    service: <T>(token: ServiceToken<T>) => own.get(token.id) as T | undefined,
  }))

  const auths = new WeakMap<IncomingMessage, Auth | { status: number, message: string }>()
  /** Who sent a request, and whether to the console; or why it is refused. */
  const authenticate = (req: IncomingMessage): Auth | { status: number, message: string } => {
    const known = auths.get(req)
    if (known) return known
    const result = identify(req)
    auths.set(req, result)
    return result
  }
  const identify = (req: IncomingMessage): Auth | { status: number, message: string } => {
    const host = header(req.headers, 'host')
    const origin = originHost(header(req.headers, 'origin'))
    if (!shared) {
      // LOCAL: this machine only, against DNS rebinding and other sites (10.3).
      if (!isLoopback(host)) return { status: 403, message: `Host ${host ?? '(none)'} is not this machine` }
      if (origin !== undefined && !isLoopback(origin)) return { status: 403, message: `Origin ${header(req.headers, 'origin')} is not this machine` }
      return { member: LOCAL_AUTHOR, console: false }
    }
    // SHARED: only what the login proxy forwards.
    const fromProxy = (shared.proxySecret && sameSecret(header(req.headers, 'x-presmium-proxy-secret'), shared.proxySecret))
      || trusted.has((req.socket.remoteAddress ?? '').replace(/^::ffff:/, ''))
    if (!fromProxy) return { status: 403, message: 'requests must come through the login proxy' }
    const identity: Identity = {
      user: header(req.headers, 'x-forwarded-user'),
      email: header(req.headers, 'x-forwarded-email'),
      name: header(req.headers, 'x-forwarded-preferred-username'),
      groups: (header(req.headers, 'x-forwarded-groups') ?? '').split(',').map(group => group.trim()).filter(Boolean),
    }
    const id = identity.email ?? identity.user
    if (!id) return { status: 401, message: 'the login proxy passed no identity' }
    const roles = options.roles?.(identity) ?? []
    const member: Member = { id, name: identity.name ?? identity.user ?? id, ...identity.email ? { email: identity.email } : {}, roles: roles.length ? roles : ['reader'] }
    const console = hostname(host) === consoleHost
    const method = (req.method ?? 'GET').toUpperCase()
    const upgrade = header(req.headers, 'upgrade') !== undefined
    if (console) {
      // The console takes requests from its own page only (10.4, WP-91), for its routes and its proxies alike: a
      // state change carries its Origin and `Presmium-Console`; a WebSocket its Origin; any other request that
      // a browser marks (Sec-Fetch-Site) comes from the same origin, except the page itself, which a link may open.
      const page = (method === 'GET' || method === 'HEAD') && new URL(req.url ?? '/', 'http://console').pathname === '/'
      if (method !== 'GET' && method !== 'HEAD' && (origin !== consoleHost || header(req.headers, CONSOLE_HEADER) !== '1')) {
        return { status: 403, message: 'the owner console takes changes only from its own page' }
      }
      if (upgrade && origin !== consoleHost) return { status: 403, message: 'the owner console takes WebSockets only from its own page' }
      const site = header(req.headers, 'sec-fetch-site')
      if (!page && site !== undefined && site !== 'same-origin') return { status: 403, message: 'the owner console takes requests only from its own page' }
    } else if ((upgrade || (method !== 'GET' && method !== 'HEAD')) && origin !== undefined && origin !== hostname(host)) {
      // State changes and WebSockets on the site come from the site.
      return { status: 403, message: 'cross-origin request' }
    }
    return { member, console }
  }

  const refuse = (auth: { status: number, message: string }): Decision => ({ kind: 'answer', response: problem(auth.status, auth.message) })

  /**
   * SHARED: `/mcp` on the site's host names is authenticated by its MCP token
   * alone, not by the login proxy (10.3): agents reach it through the
   * gateway, which forwards it as it is (10.9). The console has no MCP.
   */
  const tokenOnly = (req: IncomingMessage, path: string) => Boolean(shared) && isMcp(path) && hostname(header(req.headers, 'host')) !== consoleHost

  const decide = async (req: IncomingMessage): Promise<Decision> => {
    const url = new URL(req.url ?? '/', 'http://presmium')
    const path = url.pathname
    if (tokenOnly(req, path)) return { kind: 'fetch' }
    const auth = authenticate(req)
    if ('status' in auth) return refuse(auth)
    const target = pluginPath(path)
    // A route's or a proxy's path stays under it: no `.` or `..` part, no encoded separator (WP-91).
    if (target && !target.plain) return refuse({ status: 400, message: 'a path with a . or .. part or an encoded separator' })
    if (auth.console) {
      // The console has Presmium's page, its control channel, the owner routes and owner proxies; nothing of the site, no MCP.
      if (target && target.plugin !== 'presmium.server') return await proxyOf(target, documentOf(req.headers, url), auth, url.search) ?? { kind: 'fetch' }
      if (path === '/' || path === CONSOLE_SCRIPT_PATH || target) return { kind: 'fetch' }
      return { kind: 'answer', response: new Response('not found', { status: 404, headers: CONSOLE_HEADERS }) }
    }
    if (isMcp(path)) return { kind: 'fetch' }
    if (target) {
      if (target.plugin === 'presmium.server') return { kind: 'fetch' }
      const proxy = await proxyOf(target, documentOf(req.headers, url), auth, url.search)
      return proxy ?? { kind: 'fetch' }
    }
    const forward = options.mode === 'serve' ? options.forward?.(auth.member) : undefined
    if (!forward) return { kind: 'answer', response: problem(404, 'not found') }
    // The site runs in agent-host, the sandbox, in SHARED mode: it gets no credential of the member's.
    return { kind: 'proxy', to: { target: forward, path: req.url ?? '/', ...shared ? { strip: CREDENTIAL_STRIP, stripResponse: RESPONSE_STRIP } : { strip: PROXY_STRIP } } }
  }

  /**
   * A plugin's proxy for the path, when one matches and the member may use it. In SHARED mode an owner
   * proxy is on the owner console only, the others on the site only (as routes, 10.4); the target gets
   * none of the member's credentials and sets no cookie; a proxy to the gateway carries a token scoped to
   * the plugin its target names, never serve's service token (WP-91).
   */
  const proxyOf = async (target: { plugin: string, path: string, raw: string }, dir: string, auth: Auth, search: string): Promise<Decision | undefined> => {
    const contribution = (await mount(dir))?.contributions.get(target.plugin)
    const found = findProxy(contribution?.proxies, target.path)
    if (!found) return undefined
    const role = found.spec.role ?? 'editor'
    if (shared && (role === 'owner') !== auth.console) return { kind: 'answer', response: auth.console ? new Response('not found', { status: 404, headers: CONSOLE_HEADERS }) : problem(404, 'not found') }
    if (!hasRole(auth.member, role)) return refuse({ status: 403, message: `this proxy needs the role ${role}` })
    // The rest of the path as the request has it (a plain path: its parts are the decoded path's).
    const base = found.spec.path.split('/').filter(Boolean).length
    const rest = target.raw.split('/').slice(base).join('/')
    const path = `${rest ? `/${rest}` : found.rest || '/'}${search}`
    if (!shared) return { kind: 'proxy', to: { target: found.spec.target, path, headers: found.spec.headers, strip: PROXY_STRIP } }
    if (!sameOrigin(found.spec.target, shared.gateway.url)) {
      return { kind: 'proxy', to: { target: found.spec.target, path, headers: found.spec.headers, strip: CREDENTIAL_STRIP, stripResponse: RESPONSE_STRIP } }
    }
    let token: string
    try {
      token = await proxyToken(gatewayPlugin(found.spec.target))
    } catch (error) {
      return refuse({ status: 502, message: `the gateway issued no token for this proxy: ${errorMessage(error)}` })
    }
    const headers = Object.fromEntries(Object.entries(found.spec.headers ?? {}).filter(([name]) => name.toLowerCase() !== 'authorization'))
    return { kind: 'proxy', to: { target: found.spec.target, path, headers: { ...headers, authorization: `Bearer ${token}` }, strip: GATEWAY_STRIP, stripResponse: RESPONSE_STRIP } }
  }

  /** The tokens of the proxies to the gateway, one per plugin, issued with serve's service token and renewed before they expire. */
  const proxyTokens = new Map<string, Promise<{ id: string, token: string, expires: number }>>()
  const proxyToken = async (plugin: string | undefined): Promise<string> => {
    const key = plugin ?? ''
    const known = await proxyTokens.get(key)?.catch(() => undefined)
    if (known && known.expires - Date.now() > 5 * 60_000) return known.token
    const issuing = (async () => {
      const gateway = shared!.gateway
      const response = await fetch(`${gateway.url.replace(/\/+$/, '')}/tokens`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${gateway.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ plugins: plugin ? [plugin] : [], purpose: `proxy:${plugin ?? ''}`, ttlSeconds: 3600 }),
      })
      if (!response.ok) throw new Error(`${response.status} ${await response.text()}`)
      const body = (await response.json()) as { id: string, token: string, expires: string }
      return { id: body.id, token: body.token, expires: Date.parse(body.expires) }
    })()
    proxyTokens.set(key, issuing)
    return (await issuing).token
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
    if (tokenOnly(req, path)) return serveMcp(request)
    const auth = authenticate(req)
    if ('status' in auth) return problem(auth.status, auth.message)
    const document = documentOf(req.headers, url)
    const consoleHeaders = auth.console ? CONSOLE_HEADERS : undefined
    if (auth.console && path === '/') {
      if (!hasRole(auth.member, 'owner')) return problem(403, 'the owner console is for owners')
      return new Response(consolePage(header(req.headers, 'accept-language') ?? 'en'), { headers: { 'Content-Type': 'text/html; charset=utf-8', ...CONSOLE_HEADERS } })
    }
    if (auth.console && path === CONSOLE_SCRIPT_PATH) return new Response(CONSOLE_SCRIPT, { headers: { 'Content-Type': 'text/javascript; charset=utf-8', ...CONSOLE_HEADERS } })
    if (isMcp(path)) return serveMcp(request)
    if (path.startsWith(`${SERVER_PATH}/`)) return withHeaders(await serverRoute(request, path.slice(SERVER_PATH.length + 1), auth, document, req), consoleHeaders)
    const target = pluginPath(path)
    if (!target) return problem(404, 'not found')
    return withHeaders(await pluginRoute(request, target, auth, document), consoleHeaders)
  }

  const serverRoute = async (request: Request, route: string, auth: Auth, document: string, req: IncomingMessage): Promise<Response> => {
    if (route === 'hello') {
      const consoleUrl = shared && !auth.console && hasRole(auth.member, 'owner') ? `//${consoleHost}${portOf(header(req.headers, 'host'))}/` : undefined
      return json({ member: auth.member, document, trust, ...consoleUrl ? { console: consoleUrl } : {} })
    }
    if (route === 'routes') {
      if (!auth.console && shared) return problem(404, 'not found')
      if (!hasRole(auth.member, 'owner')) return problem(403, 'owner routes are for owners')
      const routes: { document: string, plugin: string, path: string }[] = []
      for (const [dir, known] of mounted) {
        for (const [plugin, contribution] of (await known.catch(() => undefined))?.contributions ?? []) {
          for (const [path, value] of Object.entries(contribution.routes ?? {})) if (value.role === 'owner') routes.push({ document: dir, plugin, path })
        }
      }
      return json({ routes })
    }
    if (route === 'control') {
      if (auth.console && !hasRole(auth.member, 'owner')) return problem(403, 'the owner console is for owners')
      if (request.method === 'GET') {
        const window = new URL(request.url).searchParams.get('window') || randomUUID()
        const consoleUrl = shared && !auth.console ? `//${consoleHost}${portOf(header(req.headers, 'host'))}/` : undefined
        const stream = control.open(window, auth.member, document, auth.console, consoleUrl)
        req.once('close', () => stream.close())
        return eventStream(stream, request.signal)
      }
      if (request.method !== 'POST') return problem(405, 'GET or POST')
      const body: unknown = await request.json().catch(() => undefined)
      if (!isRecord(body)) return problem(400, 'a JSON object')
      if (body.type === 'answer' && typeof body.id === 'string') {
        const status = control.answer(body.id, body.allow === true, auth.member, auth.console)
        return status === 200 ? json({ ok: true }) : problem(status, status === 404 ? 'no such approval' : 'this member may not answer this approval here')
      }
      if (body.type === 'report' && typeof body.window === 'string') {
        const position = isRecord(body.position) ? body.position as unknown as WindowPosition : undefined
        const ok = control.report(body.window, auth.member, { position, role: typeof body.role === 'string' ? body.role : undefined, status: isRecord(body.status) ? body.status : undefined })
        return ok ? json({ ok: true }) : problem(404, 'unknown window')
      }
      return problem(400, 'unknown message')
    }
    return problem(404, 'not found')
  }

  const pluginRoute = async (request: Request, target: { plugin: string, path: string }, auth: Auth, document: string): Promise<Response> => {
    const known = await mount(document)
    if (!known) return problem(404, `no document ${JSON.stringify(document)}`)
    const found = findRoute(known.contributions.get(target.plugin)?.routes, target.path)
    if (!found) return problem(404, 'not found')
    const role = found.route.role ?? 'editor'
    // Owner routes live on the owner console's origin only in SHARED mode, and the console has nothing else (10.4).
    if (shared && (role === 'owner') !== auth.console) return problem(404, 'not found')
    if (!hasRole(auth.member, role)) return problem(403, `this route needs the role ${role}`)
    try {
      return await found.route.handle(request, { member: auth.member, document, rest: found.rest })
    } catch (error) {
      log.error(`route ${target.plugin}/${target.path} failed: ${errorMessage(error)}`)
      return problem(500, errorMessage(error))
    }
  }

  const proxy = createProxy()
  const server = nodeServer({ decide, decideUpgrade, fetch: handle, proxy })
  const port = await listen(server, options.port ?? (options.mode === 'dev' ? 0 : 4310), listenHost)
  url = `http://${urlHost(listenHost)}:${port}`
  if (token && options.stateFile) {
    mkdirSync(dirname(options.stateFile), { recursive: true })
    writeFileSync(options.stateFile, `${JSON.stringify({ url, mcp: `${url}/mcp`, token, pid: process.pid }, null, 2)}\n`, { mode: 0o600 })
    chmodSync(options.stateFile, 0o600)
  }
  if (shared) await greet(shared, log)

  return {
    url,
    port,
    trust,
    token,
    services,
    control,
    serverHost: options.serverHost,
    gateway: shared?.gateway,
    agentHost: shared?.agentHost,
    async close() {
      // Waiting approvals are refused first, so the MCP calls that wait for them end.
      control.close()
      await mcp?.close().catch((error: unknown) => log.error(`MCP failed to close: ${errorMessage(error)}`))
      for (const known of mounted.values()) {
        for (const contribution of (await known.catch(() => undefined))?.contributions.values() ?? []) {
          await Promise.resolve(contribution.close?.()).catch((error: unknown) => log.error(`a contribution failed to close: ${errorMessage(error)}`))
        }
      }
      proxy.close()
      await closeServer(server)
      // The proxies' gateway tokens go with the server.
      for (const issued of proxyTokens.values()) {
        const known = await issued.catch(() => undefined)
        if (known && shared) await fetch(`${shared.gateway.url.replace(/\/+$/, '')}/tokens/${encodeURIComponent(known.id)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${shared.gateway.token}` }, signal: AbortSignal.timeout(5000) }).catch(() => undefined)
      }
    },
  }
}

/** The `:port` of a `Host` header, to give the console's address on the same port. */
function portOf(host: string | undefined): string {
  return /:(\d+)$/.exec(host ?? '')?.[0] ?? ''
}

function withHeaders(response: Response, headers: Record<string, string> | undefined): Response {
  if (!headers) return response
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

/** SHARED serve reaches the gateway and agent-host with their tokens when it starts (and logs what it found). */
async function greet(shared: SharedSetup, log: Logger): Promise<void> {
  const ask = async (name: string, url: string, token: string) => {
    try {
      const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5000) })
      if (response.ok) log.info(`${name} answers at ${url}`)
      else log.warn(`${name} at ${url} answered ${response.status}`)
    } catch (error) {
      log.warn(`${name} at ${url} is not reachable yet: ${errorMessage(error)}`)
    }
  }
  await Promise.all([
    ask('the gateway', `${shared.gateway.url.replace(/\/$/, '')}/info`, shared.gateway.token),
    ask('agent-host', `${shared.agentHost.url.replace(/\/$/, '')}/v1/info`, shared.agentHost.token),
  ])
}

function prefixed(log: Logger, id: string): Logger {
  const tag = `[${id}]`
  return {
    debug: (...args) => log.debug(tag, ...args),
    info: (...args) => log.info(tag, ...args),
    warn: (...args) => log.warn(tag, ...args),
    error: (...args) => log.error(tag, ...args),
  }
}
