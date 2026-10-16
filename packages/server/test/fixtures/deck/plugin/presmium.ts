// The server contribution of a test plugin (packages/server/test, e2e/server.spec.ts): its routes return
// what the plugin's own Node service holds, the contexts the plugin got, and the answer to an approval.
// Plain objects: tokens are compared by id, so the fixture needs no package to compile.
interface Context { config: Record<string, unknown>, settings: Record<string, unknown>, trust: string, operatorDir?: string, secret(name: string): string | undefined, service(token: { id: string }): any }
interface Request { url: string }
interface RequestContext { member: { id: string, roles: string[] }, document: string, rest: string }

const ECHO = { id: 'fixture.echo' }
const APPROVALS = { id: 'presmium.approvals' }

const json = (data: unknown) => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } })

export default {
  id: 'fixture.server',
  version: '0.1.0',
  kernel: '^0.1.0',
  services: (ctx: Context) => [[ECHO, { value: 'from the node service', settings: ctx.settings, config: ctx.config, trust: ctx.trust }]],
  server: (ctx: Context) => ({
    routes: {
      'value': { role: 'reader', handle: () => json({ value: ctx.service(ECHO).value }) },
      'reader': { role: 'reader', handle: (_: Request, r: RequestContext) => json({ ok: true, member: r.member }) },
      'editor': { handle: (_: Request, r: RequestContext) => json({ ok: true, member: r.member }) },
      'owner': { role: 'owner', handle: () => json({ ok: true, owner: true }) },
      'context': {
        role: 'reader',
        handle: () => json({
          trust: ctx.trust,
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
    },
  }),
}
