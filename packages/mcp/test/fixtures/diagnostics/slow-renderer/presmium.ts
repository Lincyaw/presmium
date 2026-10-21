import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout } from 'node:timers/promises'

export default {
  id: 'fixture.slow-renderer',
  renderer: {
    id: 'slides',
    support: () => 'full',
    async build(_doc, ctx) {
      return { outDir: ctx.outDir, skipped: [] }
    },
    async dev(doc, ctx) {
      writeFileSync(join(ctx.deckDir, 'preview-started'), doc.meta.title)
      while (existsSync(join(ctx.deckDir, 'hold-preview'))) await setTimeout(10)
      throw new Error(`The preview failed for ${doc.meta.title}`)
    },
  },
}
