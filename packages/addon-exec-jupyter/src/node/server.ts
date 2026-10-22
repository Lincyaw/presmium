import { isRecord, problemResponse } from '@lincyaw/kernel'
import type { EnvironmentSpec, ProxySpec, Route, ServerContext, ServerContribution } from '@lincyaw/kernel'
import { authOf, cleanupPath, operatorConnection, proxyPath } from '../domain/index.ts'
import type { Connection } from '../domain/index.ts'
import { shutdownKernel } from '../jupyter/kernels.ts'
import { nodeSettings } from './connection.ts'
import { declaredEnvironments } from './environments.ts'

export function proxyHeaders(connection: Connection): Record<string, string> {
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

export function jupyterServer(ctx: ServerContext): ServerContribution {
  const reported = new Set<string>()
  const cleaning = new Map<string, Promise<void>>()
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
                task = nodeSettings(connection, timeout).then(settings => shutdownKernel(kernel, directory, settings))
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
      await Promise.allSettled(cleaning.values())
    },
  }
}
