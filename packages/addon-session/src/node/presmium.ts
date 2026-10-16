import { createRequire } from 'node:module'
import { isRecord } from '@presmium/kernel'
import type { Check, PresmiumNodePlugin } from '@presmium/kernel'
import { SESSION_ID, sessionConfig } from '../domain/index.ts'

const { version } = createRequire(import.meta.url)('../../package.json') as { version: string }

/** Without a classroom server the deck works alone, and a published deck shows no classroom: says how to set one up. */
const serverCheck: Check = {
  id: SESSION_ID,
  async run(ctx) {
    const config = ctx.ir.config.presmium[SESSION_ID]
    if (sessionConfig(isRecord(config) ? config : {}).server) return []
    return [{
      checkId: SESSION_ID,
      severity: 'info',
      message: 'no classroom server: the deck works alone, and its build shows no classroom',
      hint: 'start presmium-classroom-server and set presmium: { presmium.session: { server: ws://<host>:<port> } } in the frontmatter',
    }]
  },
}

/** The session works in the browser; in Node it only checks its configuration. */
const plugin: PresmiumNodePlugin = { id: SESSION_ID, version, kernel: '^0.1.0', checks: [serverCheck] }

export default plugin
