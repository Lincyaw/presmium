/**
 * The gateway's part (D13, docs/architecture.md 10.9): in SHARED mode the
 * operator's pairs `PRESMIUM_ENV_<NAME>_URL` and `PRESMIUM_ENV_<NAME>_TOKEN`
 * are in the gateway's environment only, and `env/<name>/` proxies HTTP and
 * WebSocket to each pair's address with its token. serve's proxy, the
 * compile-time executors in agent-host and `probe` in serve reach the
 * environments through it. An environment without an address has no proxy.
 * The gateway loads no deck: the pairs of its environment are the
 * environments.
 */
import type { GatewayContext, GatewayContribution, GatewayProxy } from '@presmium/kernel'
import { environmentOfVariable, JUPYTER_KIND, operatorConnection, proxyPath } from '../domain/index.ts'
import { proxyHeaders } from './server.ts'

/** The names of the pairs in the gateway's environment (`PRESMIUM_ENV_<NAME>_URL`), as their proxy paths name them. */
function pairNames(variables: Iterable<string>): string[] {
  return [...new Set([...variables].flatMap(variable => environmentOfVariable(variable) ?? []))].sort()
}

export function jupyterGateway(ctx: GatewayContext, variables: Iterable<string> = Object.keys(process.env)): GatewayContribution {
  const proxies: GatewayProxy[] = []
  for (const name of pairNames(variables)) {
    const resolved = operatorConnection(name, { kind: JUPYTER_KIND, auth: 'env' }, { secret: ctx.secret })
    if ('connection' in resolved) proxies.push({ path: proxyPath(name), target: resolved.connection.url, headers: proxyHeaders(resolved.connection) })
    else ctx.log.error(`environment "${name}": ${'unavailable' in resolved ? resolved.unavailable : resolved.mismatch}; no proxy`)
  }
  if (proxies.length) ctx.log.info(`remote environments: ${proxies.map(proxy => proxy.path).join(', ')}`)
  return { proxies }
}
