/**
 * The server's proxy of `auth: proxy` environments (P-105): under
 * `/__presmium/presmium.execJupyter/env/<name>/` the browser reaches the
 * environment's Jupyter Server, HTTP and WebSocket, and the server adds the
 * credentials, which the page never sees: the target is the operator's
 * `PRESMIUM_ENV_<NAME>_URL`, with `PRESMIUM_ENV_<NAME>_TOKEN`; a deck whose
 * `url` names another origin gets no proxy. Learners use it: the role is
 * `reader`.
 *
 * The proxies follow the environments the compiler last declared for the
 * deck (./environments.ts), so a recompilation that changes them changes
 * the proxies. An environment that cannot be proxied answers its requests
 * with the reason.
 */
import { problem } from '@presmium/kernel'
import type { EnvironmentSpec, ProxySpec, Route, ServerContext, ServerContribution } from '@presmium/kernel'
import { authOf, operatorConnection, proxyPath } from '../domain/index.ts'
import type { Connection } from '../domain/index.ts'
import { declaredEnvironments } from './environments.ts'

/**
 * The request headers the proxy sets: the credentials, and the target's own
 * `Host` and `Origin`, as a client of the server (a hosted server behind a
 * name-based proxy needs its host; the Jupyter Server checks a WebSocket's
 * origin against it). Lower case, so they replace the browser's.
 */
export function proxyHeaders(connection: Connection): Record<string, string> {
  const target = new URL(connection.url)
  const headers: Record<string, string> = { host: target.host, origin: target.origin }
  for (const [name, value] of Object.entries(connection.headers)) headers[name.toLowerCase()] = value
  return headers
}

interface Mount {
  proxy?: ProxySpec
  /** Why there is no proxy. */
  reason?: string
}

export function jupyterServer(ctx: ServerContext): ServerContribution {
  const reported = new Set<string>()
  const mounts = (): Map<string, Mount> => {
    const found = new Map<string, Mount>()
    for (const [name, spec] of declaredEnvironments(ctx.deckDir)) {
      if (authOf(spec) !== 'proxy') continue
      found.set(name, mount(name, spec))
    }
    return found
  }
  const mount = (name: string, spec: EnvironmentSpec): Mount => {
    const resolved = operatorConnection(name, spec, { secret: name => ctx.secret(name) })
    if ('connection' in resolved) {
      return { proxy: { path: proxyPath(name), target: resolved.connection.url, headers: proxyHeaders(resolved.connection), role: 'reader' } }
    }
    const reason = `environment "${name}": ${'unavailable' in resolved ? resolved.unavailable : resolved.mismatch}`
    if (!reported.has(reason)) {
      reported.add(reason)
      ctx.log.error(`${reason}; its proxy is not mounted`)
    }
    return { reason }
  }
  return {
    get proxies() {
      return [...mounts().values()].flatMap(found => (found.proxy ? [found.proxy] : []))
    },
    get routes() {
      const routes: Record<string, Route> = {}
      for (const [name, found] of mounts()) {
        if (!found.reason) continue
        const reason = found.reason
        routes[`${proxyPath(name)}/*`] = {
          role: 'reader',
          handle: () => problem(502, reason),
        }
      }
      return routes
    },
  }
}
