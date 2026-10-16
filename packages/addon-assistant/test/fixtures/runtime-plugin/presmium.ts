// Routes of a test plugin (packages/addon-assistant/test): `open` opens a session of the server's
// AGENT_RUNTIME for the deck directory without prompting it and answers with the runtime's provider and
// name, `close` closes it; `token` issues an MCP token for the member through MCP_ENDPOINT (`author`
// mode). Plain objects: tokens are compared by id, so the fixture needs no package to compile.
interface Context { deckDir: string, service(token: { id: string }): any }
interface RequestContext { member: { id: string, name: string, roles: string[] } }

const AGENT_RUNTIME = { id: 'presmium.agentRuntime' }
const MCP_ENDPOINT = { id: 'presmium.mcpEndpoint' }

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })

let session: any

export default {
  id: 'fixture.runtime',
  version: '0.1.0',
  kernel: '^0.1.0',
  operator: true,
  server: (ctx: Context) => ({
    routes: {
      open: {
        async handle(_request: Request, rc: RequestContext) {
          const runtime = ctx.service(AGENT_RUNTIME)
          if (!runtime) return json({ error: 'no AGENT_RUNTIME' }, 404)
          try {
            session = await runtime.open({ cwd: ctx.deckDir, mode: 'tutor', member: rc.member, approve: async () => false })
            return json({ provider: runtime.provider, runtime: runtime.runtime })
          } catch (error) {
            return json({ error: error instanceof Error ? error.message : String(error) }, 500)
          }
        },
      },
      close: {
        async handle() {
          await session?.close()
          session = undefined
          return json({})
        },
      },
      token: {
        async handle(_request: Request, rc: RequestContext) {
          const grant = ctx.service(MCP_ENDPOINT).issue(rc.member, 'author')
          return json({ url: grant.url, token: grant.token })
        },
      },
    },
  }),
}
