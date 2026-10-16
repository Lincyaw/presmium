// The server contribution of the end-to-end test plugin (e2e/server.spec.ts): a value, and an
// `operate` approval of the scope in the query for the member who calls. Plain objects; no package needed.
interface Context { service(token: { id: string }): any }

const APPROVALS = { id: 'presmium.approvals' }
const json = (data: unknown) => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } })

export default {
  id: 'fixture.server',
  version: '0.1.0',
  kernel: '^0.1.0',
  server: (ctx: Context) => ({
    routes: {
      value: { role: 'reader', handle: () => json({ value: '来自服务端的回答' }) },
      approve: {
        handle: async (request: Request, r: { member: { id: string } }) => {
          const scope = new URL(request.url).searchParams.get('scope') ?? 'content'
          const allowed = await ctx.service(APPROVALS).request({ kind: 'operate', scope, title: '运行测试操作', detail: 'print("hello")', from: 'fixture.server', member: r.member.id })
          return json({ allowed })
        },
      },
    },
  }),
}
