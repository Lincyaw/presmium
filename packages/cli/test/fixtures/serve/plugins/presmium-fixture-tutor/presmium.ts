// The test plugin of packages/cli/test/audience.test.ts: its route issues a `tutor` MCP token for the member
// who calls (`MCP_ENDPOINT.issue`), as the assistant does for a learner's question. Plain objects: tokens
// are compared by id, so the fixture needs no package.
interface Context { service(token: { id: string }): any }
interface RequestContext { member: { id: string, name: string, roles: string[] } }

const MCP_ENDPOINT = { id: 'presmium.mcpEndpoint' }

export default {
  id: 'fixture.tutor',
  version: '0.1.0',
  kernel: '^0.1.0',
  server: (ctx: Context) => ({
    routes: {
      tutor: {
        role: 'reader',
        handle: (_: Request, r: RequestContext) => {
          const grant = ctx.service(MCP_ENDPOINT).issue(r.member, 'tutor') as { url: string, token: string }
          return new Response(JSON.stringify({ url: grant.url, token: grant.token }), { headers: { 'Content-Type': 'application/json' } })
        },
      },
    },
  }),
}
