// The server contribution of a test plugin (packages/server/test, e2e/server.spec.ts): its routes return
// what the plugin's own Node service holds, the contexts the plugin got, the answer to an approval and an
// MCP token for the member, and the size of a body (with the default limit, and one of 16 MiB); a proxy
// to a listener of the test's. Its contribution counts how often it was closed. Plain objects: tokens are compared by id, so the fixture needs no package to compile.
interface Context { config: Record<string, unknown>, settings: Record<string, unknown>, operatorDir?: string, secret(name: string): string | undefined, service(token: { id: string }): any }
interface Request { url: string, arrayBuffer(): Promise<ArrayBuffer> }
interface RequestContext { member: { id: string, roles: string[] }, document: string, rest: string }

const ECHO = { id: 'fixture.echo' }
const APPROVALS = { id: 'presmium.approvals' }
const MCP_ENDPOINT = { id: 'presmium.mcpEndpoint' }

const json = (data: unknown) => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } })

/** How many contributions of this process were closed (a document taken down, F-40): each document loads its copy of this module. */
const counted = globalThis as { fixtureClosed?: number }

export default {
  id: 'fixture.server',
  version: '0.1.0',
  kernel: '^0.1.0',
  services: (ctx: Context) => [[ECHO, { value: 'from the node service', settings: ctx.settings, config: ctx.config }]],
  server: (ctx: Context) => ({
    routes: {
      'value': { role: 'reader', handle: () => json({ value: ctx.service(ECHO).value }) },
      'reader': { role: 'reader', handle: (_: Request, r: RequestContext) => json({ ok: true, member: r.member }) },
      'editor': { handle: (_: Request, r: RequestContext) => json({ ok: true, member: r.member }) },
      'owner': { role: 'owner', handle: () => json({ ok: true, owner: true }) },
      'context': {
        role: 'reader',
        handle: () => json({
          settings: ctx.settings,
          config: ctx.config,
          service: ctx.service(ECHO),
          secret: ctx.secret('OPENAI_API_KEY') ?? null,
          operatorDir: ctx.operatorDir ?? null,
        }),
      },
      // Asks for an `operate` approval of the scope in the query, for the member who calls.
      'approve': {
        handle: async (request: Request, r: RequestContext) => {
          const scope = new URL(request.url).searchParams.get('scope') ?? 'content'
          const allowed = await ctx.service(APPROVALS).request({ kind: 'operate', scope, title: '运行测试操作', detail: 'print("hello")', from: 'fixture.server', member: r.member.id })
          return json({ allowed })
        },
      },
      'echo/*': { role: 'reader', handle: (_: Request, r: RequestContext) => json({ rest: r.rest, document: r.document }) },
      // The size of the body read: the server's default limit (1 MiB), and one route that takes 16 MiB.
      'upload': { role: 'reader', handle: async (request: Request) => json({ bytes: (await request.arrayBuffer()).byteLength }) },
      'upload-large': { role: 'reader', maxBody: 16 << 20, handle: async (request: Request) => json({ bytes: (await request.arrayBuffer()).byteLength }) },
      'closed': { role: 'reader', handle: () => json({ closed: counted.fixtureClosed ?? 0 }) },
      // An `author` MCP token for the member who calls, as an agent session gets one.
      'mcp': {
        handle: (_: Request, r: RequestContext) => {
          const { url, token } = ctx.service(MCP_ENDPOINT).issue(r.member, 'author')
          return json({ url, token })
        },
      },
    },
    // A listener of the test's.
    proxies: ctx.secret('FIXTURE_UPSTREAM_URL') ? [{ path: 'upstream', target: ctx.secret('FIXTURE_UPSTREAM_URL')!, role: 'reader' }] : [],
    close: () => {
      counted.fixtureClosed = (counted.fixtureClosed ?? 0) + 1
    },
  }),
}
