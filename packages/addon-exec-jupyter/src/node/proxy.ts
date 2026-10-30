import { isRecord, jsonResponse, problemResponse } from '@lincyaw/kernel'
import type { EnvironmentSpec, ProxySpec, Route, ServerContext, ServerContribution } from '@lincyaw/kernel'
import { authOf, cleanupPath, operatorConnection, preparePath, proxyPath } from '../domain/index.ts'
import type { Connection } from '../domain/index.ts'
import { shutdownJupyterKernel } from '../shared/kernel-lifecycle.ts'
import { nodeSettings } from './connection.ts'
import { declaredEnvironments } from './declared.ts'
import { HubEnvironmentError, prepareHubEnvironment } from './hub.ts'

function proxyHeaders(connection: Connection): Record<string, string> {
  const target = new URL(connection.url)
  const headers: Record<string, string> = { host: target.host, origin: target.origin }
  for (const [name, value] of Object.entries(connection.headers)) headers[name.toLowerCase()] = value
  return headers
}

interface Mount {
  proxy?: ProxySpec
  connection?: Connection
  reason?: string
}

/** The server's proxy to each `auth: proxy` environment, and the route through which a page hands over its kernels' cleanup. */
export function jupyterProxy(ctx: ServerContext): ServerContribution {
  const reported = new Set<string>()
  const cleaning = new Map<string, Promise<void>>()
  const prepared = new Map<string, { profile: unknown, connection: Connection }>()
  const preparing = new Map<string, Promise<{ connection: Connection, generation: string }>>()
  const lifetime = new AbortController()
  const hubKey = (name: string, spec: EnvironmentSpec) => JSON.stringify([name, spec.profile])
  const mounts = (): Map<string, Mount> => {
    const found = new Map<string, Mount>()
    for (const [name, spec] of declaredEnvironments(ctx.deckDir)) {
      if (!['proxy', 'hub'].includes(authOf(spec))) continue
      found.set(name, mount(name, spec))
    }
    return found
  }
  const mount = (name: string, spec: EnvironmentSpec): Mount => {
    if (authOf(spec) === 'hub') {
      const known = prepared.get(hubKey(name, spec))
      if (!known || known.profile !== spec.profile) return { reason: 'hub-environment-not-prepared' }
      return { connection: known.connection, proxy: { path: proxyPath(name), target: known.connection.url, headers: proxyHeaders(known.connection), role: 'reader' } }
    }
    const resolved = operatorConnection(name, spec, { secret: name => ctx.secret(name) })
    if ('connection' in resolved) {
      return { connection: resolved.connection, proxy: { path: proxyPath(name), target: resolved.connection.url, headers: proxyHeaders(resolved.connection), role: 'reader' } }
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
      for (const [name, spec] of declaredEnvironments(ctx.deckDir)) {
        if (authOf(spec) !== 'hub') continue
        routes[preparePath(name)] = {
          role: 'reader',
          maxBody: 1024,
          async handle(request) {
            if (request.method !== 'POST') return problemResponse(405, 'POST')
            if (lifetime.signal.aborted) return problemResponse(503, 'hub-unavailable')
            const key = hubKey(name, spec)
            let task = preparing.get(key)
            if (!task) {
              // Shared starts outlive one disconnected tab, but are always bounded.
              if (preparing.size >= 32) return problemResponse(429, 'hub-unavailable')
              task = prepareHubEnvironment(spec, { secret: name => ctx.secret(name) }, AbortSignal.any([lifetime.signal, AbortSignal.timeout(250_000)]))
                .finally(() => preparing.delete(key))
              preparing.set(key, task)
            }
            try {
              const { connection, generation } = await task
              const current = declaredEnvironments(ctx.deckDir).get(name)
              if (lifetime.signal.aborted || !current || authOf(current) !== 'hub' || current.profile !== spec.profile) {
                return problemResponse(409, 'hub-profile-changed')
              }
              prepared.set(key, { profile: spec.profile, connection })
              return jsonResponse({ generation })
            } catch (error) {
              prepared.delete(key)
              const code = error instanceof HubEnvironmentError ? error.code : 'hub-unavailable'
              ctx.log.warn(`environment "${name}": ${code}`)
              return problemResponse(error instanceof HubEnvironmentError ? error.status : 502, code)
            }
          },
        }
      }
      for (const [name, found] of mounts()) {
        if (found.connection) {
          const connection = found.connection
          // Outside the proxy prefix: proxy routing takes precedence over routes.
          routes[cleanupPath(name)] = {
            role: 'reader',
            maxBody: 1024,
            async handle(request) {
              if (request.method !== 'POST') return problemResponse(405, 'POST')
              const body: unknown = await request.json().catch(() => undefined)
              if (!isRecord(body) || Object.keys(body).length !== 2
                || typeof body.kernel !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(body.kernel)
                || typeof body.directory !== 'string' || !/^presmium-runs\/[a-z0-9]+-[a-z0-9]+$/.test(body.directory)) {
                return problemResponse(400, 'expected a kernel id and its presmium-runs directory')
              }
              const key = JSON.stringify([connection.url, body.kernel, body.directory])
              let task = cleaning.get(key)
              if (!task) {
                if (cleaning.size >= 32) return problemResponse(429, 'too many Jupyter cleanups in progress')
                const { kernel, directory } = body
                // Do not bind to request.signal: the browser may already be gone.
                const timeout = AbortSignal.timeout(15_000)
                task = nodeSettings(connection, timeout).then(settings => shutdownJupyterKernel(kernel, directory, settings))
                  .finally(() => cleaning.delete(key))
                cleaning.set(key, task)
              }
              await task
              return new Response(null, { status: 204 })
            },
          }
        }
        if (!found.reason) continue
        const reason = found.reason
        routes[`${proxyPath(name)}/*`] = {
          role: 'reader',
          handle: () => problemResponse(502, reason),
        }
      }
      return routes
    },
    async close() {
      lifetime.abort()
      await Promise.allSettled([...cleaning.values(), ...preparing.values()])
    },
  }
}
