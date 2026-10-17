// An operator plugin (`operator: true`, listed in settings.presmium.workspace.plugins): its route `where`
// answers with the document it serves, '' on the home page, and which of the workspace's files it finds in
// its deck directory (`ctx.deckDir`): none on the home page, which is no document. Its route `approve` asks the
// member who calls for an `operate` approval of the document's content, which a window of it answers.
// Plain objects; no package needed.
import { existsSync } from 'node:fs'
import { join } from 'node:path'

interface Context { deckDir: string, workspaceRoot: string, service(token: { id: string }): any }
interface RequestContext { document: string, member: { id: string } }

/** Files of the workspace's root and of a document. */
const KNOWN = ['presmium.workspace.yaml', '.git', 'lecture.md']
const APPROVALS = { id: 'presmium.approvals' }
const json = (data: unknown) => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } })

export default {
  id: 'fixture.home',
  version: '0.1.0',
  kernel: '^0.1.0',
  operator: true,
  server: (ctx: Context) => ({
    routes: {
      where: {
        role: 'reader',
        handle: (_: Request, rc: RequestContext) => json({
          document: rc.document,
          sees: KNOWN.filter(name => existsSync(join(ctx.deckDir, name)) || existsSync(join(ctx.workspaceRoot, name))),
        }),
      },
      approve: {
        handle: async (_: Request, rc: RequestContext) => json({
          allowed: await ctx.service(APPROVALS).request({ kind: 'operate', scope: 'content', title: '局域网中的确认', detail: 'print("hello")', from: 'fixture.home', member: rc.member.id }),
        }),
      },
    },
  }),
}
