// An operator plugin (`operator: true`, listed in settings.presmium.workspace.plugins): its route `where`
// answers with the document it serves, '' on the home page, and which of the workspace's files it finds in
// its deck directory (`ctx.deckDir`): none on the home page, which is no document. Plain objects; no package needed.
import { existsSync } from 'node:fs'
import { join } from 'node:path'

interface Context { deckDir: string, workspaceRoot: string }
interface RequestContext { document: string }

/** Files of the workspace's root and of a document. */
const KNOWN = ['presmium.workspace.yaml', '.git', 'lecture.md']

export default {
  id: 'fixture.home',
  version: '0.1.0',
  kernel: '^0.1.0',
  operator: true,
  server: (ctx: Context) => ({
    routes: {
      where: {
        role: 'reader',
        handle: (_: Request, rc: RequestContext) => new Response(JSON.stringify({
          document: rc.document,
          sees: KNOWN.filter(name => existsSync(join(ctx.deckDir, name)) || existsSync(join(ctx.workspaceRoot, name))),
        }), { headers: { 'Content-Type': 'application/json' } }),
      },
    },
  }),
}
