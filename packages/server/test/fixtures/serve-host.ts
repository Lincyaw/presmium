// A `serve` mode host for the tests of the server (packages/server/test, e2e/server.spec.ts): it
// starts the real server on a workspace whose documents it compiles with the real compiler, as the
// workspace (WP-79) does, and reads them for MCP (the documents and their compiled IR; no checks,
// builds or runs). Configured by the environment: SERVE_WORKSPACE (the workspace root), SERVE_ROLES
// (JSON: email -> roles), SERVE_FORWARD (where the site's paths go), SERVE_HOST and SERVE_PORT. It
// prints `{"url": ...}` once it listens, or `{"error": ...}` and exits 1. A line `unmount <dir>` on its
// stdin takes that document's contributions down (`PresmiumServer.unmount`), then it prints `{"unmounted": <dir>}`.
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { Compiler } from '@presmium/compiler'
import type { MemberRole } from '@presmium/kernel'
import { servedDocument, startServer } from '@presmium/server'
import type { ServerHost } from '@presmium/server'

const root = process.env.SERVE_WORKSPACE ?? process.cwd()
const roles = JSON.parse(process.env.SERVE_ROLES ?? '{}') as Record<string, MemberRole[]>
const compilers = new Map<string, Compiler>()

/** The compilation of a document directory, one compiler each. */
function compile(dir: string) {
  let compiler = compilers.get(dir)
  if (!compiler) compilers.set(dir, compiler = new Compiler(join(root, dir), { trust: 'shared' }))
  return compiler.compile()
}

const unsupported = () => Promise.reject(new Error('the test host only reads documents'))
const serverHost: ServerHost = {
  async documents() {
    const dirs = readdirSync(root, { withFileTypes: true }).filter(entry => entry.isDirectory() && existsSync(join(root, entry.name, 'lecture.md'))).map(entry => entry.name)
    return Promise.all(dirs.map(async dir => ({ dir, title: (await compile(dir)).doc.meta.title })))
  },
  async compile(dir) {
    const { doc } = await compile(dir)
    return { doc, diagnostics: doc.diagnostics }
  },
  check: unsupported,
  build: unsupported,
  run: unsupported,
}

try {
  const server = await startServer({
    mode: 'serve',
    host: process.env.SERVE_HOST ?? '127.0.0.1',
    port: Number(process.env.SERVE_PORT ?? 0),
    trustProxyFrom: process.env.SERVE_TRUST_FROM ? [process.env.SERVE_TRUST_FROM] : undefined,
    roles: identity => roles[identity.email ?? ''] ?? [],
    forward: () => process.env.SERVE_FORWARD || undefined,
    approvalTimeoutMs: Number(process.env.SERVE_APPROVAL_TIMEOUT ?? 50_000),
    serverHost,
    async document(dir) {
      if (!dir || !existsSync(join(root, dir, 'lecture.md'))) return undefined
      return servedDocument(await compile(dir))
    },
  })
  process.stdout.write(`${JSON.stringify({ url: server.url, trust: server.trust })}\n`)
  createInterface({ input: process.stdin }).on('line', (line) => {
    const dir = /^unmount (.*)$/.exec(line)?.[1]
    if (dir !== undefined) void server.unmount(dir).then(() => process.stdout.write(`${JSON.stringify({ unmounted: dir })}\n`))
  })
  const stop = () => void server.close().then(() => process.exit(0))
  process.once('SIGTERM', stop)
  process.once('SIGINT', stop)
} catch (error) {
  process.stdout.write(`${JSON.stringify({ error: error instanceof Error ? error.message : String(error) })}\n`)
  process.exit(1)
}
