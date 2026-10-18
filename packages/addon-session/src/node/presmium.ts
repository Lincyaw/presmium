/**
 * The session plugin in Node: the check of its configuration, and, under
 * `presmium dev` and `presmium serve`, the classroom sync on the server's own
 * port. The deck's server contribution starts a classroom server
 * (`@presmium/classroom-server`, its protocol, rooms and archives in the
 * deck's `.presmium/classroom/`) on a loopback port of its own, which the
 * server forwards at `/__presmium/presmium.session/sync/` (HTTP and
 * WebSocket); a page whose deck names no `presmium.session.server` asks the
 * route `classroom` where that is and connects there, from this machine or,
 * with `presmium serve --host`, from another device of the local network.
 */
import { createRequire } from 'node:module'
import { startClassroomServer } from '@presmium/classroom-server'
import { isRecord, json } from '@presmium/kernel'
import type { Check, PresmiumNodePlugin } from '@presmium/kernel'
import { SESSION_ID, SYNC_PATH, sessionConfig } from '../domain/index.ts'

const { version } = createRequire(import.meta.url)('../../package.json') as { version: string }

/** Without a classroom server a published deck shows no classroom: says how to set one up. */
const serverCheck: Check = {
  id: SESSION_ID,
  async run(ctx) {
    const config = ctx.ir.config.presmium[SESSION_ID]
    if (sessionConfig(isRecord(config) ? config : {}).server) return []
    return [{
      checkId: SESSION_ID,
      severity: 'info',
      message: 'no classroom server: presmium dev and presmium serve sync the classroom on their own port; a build shows no classroom',
      hint: 'for a published deck, start presmium-classroom-server and set presmium: { presmium.session: { server: ws://<host>:<port> } } in the frontmatter',
    }]
  },
}

const plugin: PresmiumNodePlugin = {
  id: SESSION_ID,
  version,
  kernel: '^1.0.0',
  checks: [serverCheck],
  async server(ctx) {
    const classroom = await startClassroomServer({
      port: 0,
      host: '127.0.0.1',
      deck: ctx.deckDir,
      onDropped: (room, writer, reason) => ctx.log.warn(`classroom ${room}: dropped ${reason} from ${writer.presenter ? 'the presenter' : writer.participant ? `participant ${writer.participant}` : 'an unidentified participant'}`),
    })
    return {
      routes: {
        // Where a page of this document reaches the classroom: the path, and the document it names there.
        classroom: { role: 'reader', handle: (_request, { document }) => json({ path: `/__presmium/${SESSION_ID}/${SYNC_PATH}`, document }) },
      },
      proxies: [{ path: SYNC_PATH, target: `http://127.0.0.1:${classroom.port}`, role: 'reader' }],
      close: () => classroom.close(),
    }
  },
}

export default plugin
