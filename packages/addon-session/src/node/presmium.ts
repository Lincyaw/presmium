import { createRequire } from 'node:module'
import { startClassroomServer } from '@lincyaw/classroom-server'
import { isRecord, jsonResponse } from '@lincyaw/kernel'
import type { Check, PresmiumNodePlugin } from '@lincyaw/kernel'
import { SESSION_ID, SYNC_PATH, sessionConfig } from '../domain/index.ts'

const { version } = createRequire(import.meta.url)('../../package.json') as { version: string }

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
        classroom: { role: 'reader', handle: (_request, { document }) => jsonResponse({ path: `/__presmium/${SESSION_ID}/${SYNC_PATH}`, document }) },
      },
      proxies: [{ path: SYNC_PATH, target: `http://127.0.0.1:${classroom.port}`, role: 'reader' }],
      close: () => classroom.close(),
    }
  },
}

export default plugin
