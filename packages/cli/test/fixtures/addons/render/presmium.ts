// Test-only renderer `fixture`: writes the block ids it receives per section to outline.json.
// It renders no components, so they must show up in the build report.
// Its pass stamps the IR with a value from the plugin's configuration.
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { PresmiumNodePlugin } from '@presmium/kernel'

const plugin: PresmiumNodePlugin = {
  id: 'fixture.render',
  passes: [{ name: 'fixture.stamp', run: (doc, ctx) => { doc.meta.stamp = ctx.config.stamp } }],
  renderer: {
    id: 'fixture',
    support: node => node.type === 'component' ? 'none' : 'full',
    async build(doc, ctx) {
      const outline = Object.fromEntries(doc.sections.map(s => [s.id, s.blocks.map(b => b.id)]))
      await writeFile(join(ctx.outDir, 'outline.json'), JSON.stringify({ config: ctx.config, outline }))
      return { outDir: ctx.outDir, skipped: [] }
    },
  },
}

export default plugin
