import { closeSync, openSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout } from 'node:timers/promises'

interface Context { deckDir: string, config: Record<string, unknown> }

export default {
  id: 'fixture.lifecycle',
  server(ctx: Context) {
    const file = join(ctx.deckDir, 'resource.lock')
    const handle = openSync(file, 'wx')
    writeFileSync(handle, String(ctx.config.value))
    return {
      routes: { value: { handle: () => Response.json({ implementation: 'first', value: ctx.config.value }) } },
      async close() {
        // Releasing a resource can require a flush before its file or port is available again.
        await setTimeout(200)
        closeSync(handle)
        unlinkSync(file)
      },
    }
  },
}
