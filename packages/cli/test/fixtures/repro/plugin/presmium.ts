// Test-only plugin `fixture.repro`: its pass resolves the `data` option against the deck, in the
// deck's configuration and in a section's {config}, as a plugin that works with files does (e.g. a
// workspace), so the configuration holds paths of the machine. `site` is a path of the published site.
import { resolve } from 'node:path'
import type { PresmiumNodePlugin } from '@lincyaw/kernel'

const ID = 'fixture.repro'

const plugin: PresmiumNodePlugin = {
  id: ID,
  passes: [{
    name: 'fixture.repro.paths',
    run(doc, ctx) {
      const resolved = (config: Record<string, unknown>) => ({ ...config, data: resolve(ctx.deckDir, String(config.data)) })
      doc.config.presmium = { ...doc.config.presmium, [ID]: resolved(ctx.config) }
      for (const section of doc.sections) {
        const own = section.config?.[ID]
        if (own) section.config![ID] = resolved(own)
      }
    },
  }],
}

export default plugin
