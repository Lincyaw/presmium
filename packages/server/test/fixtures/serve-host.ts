// A `serve` mode host for the tests of the server (packages/server/test, e2e/server.spec.ts): it
// starts the real server on a workspace whose documents it compiles with the real compiler, as the
// workspace (WP-79) will. Configured by the environment: SERVE_WORKSPACE (the workspace root),
// SERVE_ROLES (JSON: email -> roles), SERVE_FORWARD (where the site's paths go), SERVE_HOST and
// SERVE_PORT. It prints `{"url": ...}` once it listens, or `{"error": ...}` and exits 1.
import { join } from 'node:path'
import { Compiler } from '@presmium/compiler'
import type { MemberRole } from '@presmium/kernel'
import { servedDocument, startServer } from '@presmium/server'

const root = process.env.SERVE_WORKSPACE ?? process.cwd()
const roles = JSON.parse(process.env.SERVE_ROLES ?? '{}') as Record<string, MemberRole[]>
const compilers = new Map<string, Compiler>()

try {
  const server = await startServer({
    mode: 'serve',
    host: process.env.SERVE_HOST ?? '127.0.0.1',
    port: Number(process.env.SERVE_PORT ?? 0),
    trustProxyFrom: process.env.SERVE_TRUST_FROM ? [process.env.SERVE_TRUST_FROM] : undefined,
    roles: identity => roles[identity.email ?? ''] ?? [],
    forward: () => process.env.SERVE_FORWARD || undefined,
    approvalTimeoutMs: Number(process.env.SERVE_APPROVAL_TIMEOUT ?? 50_000),
    async document(dir) {
      if (!dir) return undefined
      let compiler = compilers.get(dir)
      if (!compiler) compilers.set(dir, compiler = new Compiler(join(root, dir), { trust: 'shared' }))
      return servedDocument(await compiler.compile())
    },
  })
  process.stdout.write(`${JSON.stringify({ url: server.url, trust: server.trust })}\n`)
  const stop = () => void server.close().then(() => process.exit(0))
  process.once('SIGTERM', stop)
  process.once('SIGINT', stop)
} catch (error) {
  process.stdout.write(`${JSON.stringify({ error: error instanceof Error ? error.message : String(error) })}\n`)
  process.exit(1)
}
