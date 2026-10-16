// The test plugin of packages/mcp/test: its routes issue a `tutor` MCP token for the member who calls
// (`MCP_ENDPOINT.issue`) and revoke it, as the assistant does for an agent session; and it contributes
// a read agent tool. Plain objects: tokens are compared by id, so the fixture needs no package.
interface Grant { url: string, token: string, revoke(): void }
interface Context { service(token: { id: string }): any }
interface RequestContext { member: { id: string, name: string, roles: string[] } }

const MCP_ENDPOINT = { id: 'presmium.mcpEndpoint' }
const json = (data: unknown) => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } })

let grant: Grant | undefined

export default {
  id: 'fixture.mcp',
  version: '0.1.0',
  kernel: '^0.1.0',
  server: (ctx: Context) => ({
    routes: {
      tutor: {
        role: 'reader',
        handle: (_: Request, r: RequestContext) => {
          grant = ctx.service(MCP_ENDPOINT).issue(r.member, 'tutor') as Grant
          return json({ url: grant.url, token: grant.token })
        },
      },
      revoke: {
        role: 'reader',
        handle: () => {
          grant?.revoke()
          return json({ revoked: Boolean(grant) })
        },
      },
    },
  }),
  tools: [
    {
      name: 'fixture_echo',
      description: 'Echoes its text, with the document and member of the call',
      input: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
      kind: 'read',
      run: async (input: { text: string }, ctx: { document: string, member: { id: string } }) => ({ echo: input.text, document: ctx.document, member: ctx.member.id }),
    },
  ],
}
