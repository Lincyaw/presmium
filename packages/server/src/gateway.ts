/**
 * `presmium gateway` (D13, docs/architecture.md 10.9): in SHARED mode the
 * one process with third-party credentials. It loads the operator's plugins
 * of the workspace configuration and mounts their `gateway()` contributions
 * under `/<plugin id>/`; it issues and revokes scoped tokens; it forwards
 * `/mcp` as it is to serve. It listens on this machine by default, checks
 * `Host`, and takes no request that has an `Origin` (serve, agent-host and
 * agents send none).
 */
import { randomBytes, randomUUID } from 'node:crypto'
import type { IncomingMessage } from 'node:http'
import { resolve } from 'node:path'
import { errorMessage, isRecord } from '@presmium/kernel'
import type { GatewayContext, GatewayContribution, GatewayGrant, GatewayProxy, GatewayRoute, Logger } from '@presmium/kernel'
import { loadPlugins, operatorPlugins, pluginId, pluginLogger, workspaceSettings } from '@presmium/compiler'
import { bearer, closeServer, createProxy, header, hostname, isLoopback, json, listen, nodeServer, problem, sameSecret, urlHost } from './http.ts'
import type { Decision, ProxyTarget } from './http.ts'

export interface GatewayOptions {
  /** The workspace root: the gateway reads its configuration and the operator's plugins installed there, nothing else. */
  workspace: string
  /** The operator directory (consent records), mounted in the gateway only. */
  operatorDir: string
  /** serve's address, to which `/mcp` is forwarded. */
  serve?: string
  /** Default 127.0.0.1. */
  host?: string
  /** Default 4320. */
  port?: number
  /** serve's service token (`PRESMIUM_GATEWAY_TOKEN`). */
  token: string
  /** Further host names the gateway answers to besides this machine's and `host` (compose: `gateway`). */
  hostnames?: string[]
  /** The directory from which Presmium's own packages installed with the CLI resolve. */
  bundled?: string
  /** The process's environment (`GatewayContext.secret`); default `process.env`. */
  env?: NodeJS.ProcessEnv
  /** How long a scoped token lives when its request names no time; default an hour. */
  ttlSeconds?: number
  log?: Logger
}

export interface Gateway {
  url: string
  port: number
  /** The plugin ids with a gateway contribution. */
  plugins: string[]
  close(): Promise<void>
}

interface Scoped extends GatewayGrant {
  id: string
}

const STDERR: Logger = {
  debug: () => {},
  info: (...args) => console.error('[presmium gateway]', ...args),
  warn: (...args) => console.error('[presmium gateway]', ...args),
  error: (...args) => console.error('[presmium gateway]', ...args),
}

/** The route of a contribution for a path: an exact key, or the longest `<prefix>/*`. */
function findRoute(routes: Record<string, GatewayRoute> | undefined, path: string): { route: GatewayRoute, rest: string } | undefined {
  if (!routes) return undefined
  if (routes[path] && !path.endsWith('/*')) return { route: routes[path]!, rest: '' }
  let best: { route: GatewayRoute, rest: string, length: number } | undefined
  for (const [key, route] of Object.entries(routes)) {
    if (!key.endsWith('/*')) continue
    const prefix = key.slice(0, -1)
    if ((path.startsWith(prefix) || path === key.slice(0, -2)) && (!best || key.length > best.length)) best = { route, rest: path.slice(prefix.length), length: key.length }
  }
  return best
}

function findProxy(proxies: GatewayProxy[] | undefined, path: string): { spec: GatewayProxy, rest: string } | undefined {
  for (const spec of proxies ?? []) {
    const base = spec.path.replace(/^\/+|\/+$/g, '')
    if (path === base || path.startsWith(`${base}/`)) return { spec, rest: path.slice(base.length) }
  }
  return undefined
}

export async function startGateway(options: GatewayOptions): Promise<Gateway> {
  const env = options.env ?? process.env
  const log = options.log ?? STDERR
  const root = resolve(options.workspace)
  const listenHost = options.host ?? '127.0.0.1'
  const { settings, problem: unreadable } = workspaceSettings(root)
  if (unreadable) throw new Error(unreadable)
  const listed = operatorPlugins(settings)
  const loaded = await loadPlugins(root, listed, { workspaceRoot: root, listed, bundled: options.bundled, policy: true })
  for (const { message } of loaded.problems) log.error(message)
  const contributions = new Map<string, GatewayContribution>()
  for (const plugin of loaded.plugins) {
    const contribute = plugin.plugin?.gateway
    if (!contribute) continue
    const id = pluginId(plugin)
    const ctx: GatewayContext = {
      settings: settings[id] ?? {},
      secret: name => env[name] || undefined,
      operatorDir: resolve(options.operatorDir),
      log: pluginLogger(id),
    }
    try {
      contributions.set(id, await contribute.call(plugin.plugin, ctx))
    } catch (error) {
      log.error(`plugin ${id} failed to make its gateway contribution: ${errorMessage(error)}`)
    }
  }

  const scoped = new Map<string, Scoped>()
  const byId = new Map<string, string>()
  const names = new Set([hostname(listenHost), ...(options.hostnames ?? []).map(hostname)])
  const forever = new Date(8.64e15).toISOString()
  const service: GatewayGrant = { kind: 'service', plugins: [...contributions.keys()], purpose: 'serve', expires: forever }

  /** The grant of a request's token; a status when there is none. */
  const grantOf = (value: string | undefined): GatewayGrant | 401 => {
    if (!value) return 401
    if (sameSecret(value, options.token)) return service
    const grant = scoped.get(value)
    if (!grant || Date.parse(grant.expires) <= Date.now()) {
      if (grant) {
        scoped.delete(value)
        byId.delete(grant.id)
      }
      return 401
    }
    return grant
  }

  /**
   * The checks every request passes: this machine's (or the given) host name, no `Origin`, and a plain
   * path: none of its parts `.` or `..`, encoded or not, and no encoded separator, so that what a route or
   * a proxy gets is under it (WP-91).
   */
  const checked = (req: IncomingMessage): Response | undefined => {
    const host = header(req.headers, 'host')
    if (!isLoopback(host) && !names.has(hostname(host))) return problem(403, `Host ${host ?? '(none)'} is not the gateway`)
    if (header(req.headers, 'origin') !== undefined) return problem(403, 'the gateway takes no request from a browser')
    const path = (req.url ?? '/').split(/[?#]/)[0]!
    if (!path.startsWith('/') || /%(?:2f|5c)|\\/i.test(path) || path.split('/').some(part => /^(?:\.|%2e){1,2}$/i.test(part))) return problem(400, 'not a plain path')
    return undefined
  }

  const proxy = createProxy()
  const decide = async (req: IncomingMessage): Promise<Decision> => {
    const refused = checked(req)
    if (refused) return { kind: 'answer', response: refused }
    const url = new URL(req.url ?? '/', 'http://gateway')
    if (url.pathname === '/mcp' || url.pathname.startsWith('/mcp/')) {
      // As it is: serve checks the MCP token.
      if (!options.serve) return { kind: 'answer', response: problem(404, 'no serve to forward /mcp to') }
      return { kind: 'proxy', to: { target: options.serve, path: req.url ?? '/mcp' } }
    }
    const match = /^\/([^/]+)\/?(.*)$/.exec(url.pathname)
    const contribution = match && contributions.get(match[1]!)
    const found = contribution && findProxy(contribution.proxies, match[2]!)
    if (!found) return { kind: 'fetch' }
    const grant = grantOf(bearer(header(req.headers, 'authorization')))
    if (grant === 401) return { kind: 'answer', response: problem(401, 'a valid token is needed') }
    if (grant.kind === 'scoped' && !grant.plugins.includes(match[1]!)) return { kind: 'answer', response: problem(403, `this token does not reach ${match[1]}`) }
    // The caller's token stays here; the upstream gets the operator's credentials (the proxy's headers).
    const to: ProxyTarget = { target: found.spec.target, path: `${found.rest || '/'}${url.search}`, headers: found.spec.headers, strip: ['authorization'] }
    return { kind: 'proxy', to }
  }

  const handle = async (request: Request, req: IncomingMessage): Promise<Response> => {
    const refused = checked(req)
    if (refused) return refused
    const url = new URL(request.url)
    const grant = grantOf(bearer(request.headers.get('authorization')))
    if (grant === 401) return problem(401, 'a valid token is needed')
    if (url.pathname === '/info') return json({ plugins: [...contributions.keys()] })
    if (url.pathname === '/tokens' || url.pathname.startsWith('/tokens/')) {
      if (grant.kind !== 'service') return problem(403, 'only the service token issues and revokes tokens')
      if (request.method === 'POST' && url.pathname === '/tokens') {
        const body: unknown = await request.json().catch(() => undefined)
        if (!isRecord(body) || !Array.isArray(body.plugins) || typeof body.purpose !== 'string') return problem(400, '{ plugins: string[], purpose: string, member?: string, ttlSeconds?: number }')
        const ttl = typeof body.ttlSeconds === 'number' && body.ttlSeconds > 0 ? body.ttlSeconds : options.ttlSeconds ?? 3600
        const token = randomBytes(24).toString('base64url')
        const grant: Scoped = {
          id: randomUUID(),
          kind: 'scoped',
          plugins: body.plugins.filter((p): p is string => typeof p === 'string'),
          purpose: body.purpose,
          ...typeof body.member === 'string' ? { member: body.member } : {},
          expires: new Date(Date.now() + ttl * 1000).toISOString(),
        }
        scoped.set(token, grant)
        byId.set(grant.id, token)
        log.info(`issued a token for ${grant.purpose} (${grant.plugins.join(', ') || 'no plugin'})`)
        return json({ id: grant.id, token, expires: grant.expires }, 201)
      }
      const id = /^\/tokens\/([^/]+)$/.exec(url.pathname)?.[1]
      if (request.method === 'DELETE' && id) {
        const token = byId.get(id)
        if (!token) return problem(404, 'no such token')
        scoped.delete(token)
        byId.delete(id)
        return new Response(null, { status: 204 })
      }
      return problem(405, 'POST /tokens or DELETE /tokens/<id>')
    }
    const match = /^\/([^/]+)\/?(.*)$/.exec(url.pathname)
    const plugin = match?.[1]
    const contribution = plugin ? contributions.get(plugin) : undefined
    let path = match?.[2] ?? ''
    try {
      path = decodeURIComponent(path)
    } catch {
      // Kept as written.
    }
    const found = contribution && findRoute(contribution.routes, path)
    if (!found || !plugin) return problem(404, 'not found')
    if (grant.kind === 'scoped' && !grant.plugins.includes(plugin)) return problem(403, `this token does not reach ${plugin}`)
    if (found.route.service && grant.kind !== 'service') return problem(403, 'this route takes the service token only')
    try {
      return await found.route.handle(request, { grant, rest: found.rest })
    } catch (error) {
      log.error(`gateway route ${plugin}/${path} failed: ${errorMessage(error)}`)
      return problem(500, errorMessage(error))
    }
  }

  const decideUpgrade = async (req: IncomingMessage): Promise<{ to?: ProxyTarget, status?: number }> => {
    const decision = await decide(req)
    if (decision.kind === 'proxy') return { to: decision.to }
    return { status: decision.kind === 'answer' ? decision.response.status : 404 }
  }

  const server = nodeServer({ decide, decideUpgrade, fetch: handle, proxy })
  const port = await listen(server, options.port ?? 4320, listenHost)
  return {
    url: `http://${urlHost(listenHost)}:${port}`,
    port,
    plugins: [...contributions.keys()],
    async close() {
      for (const contribution of contributions.values()) {
        await Promise.resolve(contribution.close?.()).catch((error: unknown) => log.error(`a contribution failed to close: ${errorMessage(error)}`))
      }
      proxy.close()
      await closeServer(server)
    },
  }
}
