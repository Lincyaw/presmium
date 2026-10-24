// Test-only renderer `fixture`: writes the block ids it receives per section to outline.json, with
// the steps of its view of each section and of its blocks. It renders no components, so they must
// show up in the build report. Its dev server records the section titles of every IR it receives,
// and its closing, in dev.json. Its pass stamps the IR with a value from the plugin's configuration.
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { IRDocument, PresmiumNodePlugin } from '@lincyaw/kernel'

const titles = (doc: IRDocument) => doc.sections.map(s => s.title)

const plugin: PresmiumNodePlugin = {
  id: 'fixture.render',
  passes: [{ name: 'fixture.stamp', run: (doc, ctx) => { doc.meta.stamp = ctx.config.stamp } }],
  renderer: {
    id: 'fixture',
    support: node => node.type === 'component' ? 'none' : 'full',
    async build(doc, ctx) {
      const outline = Object.fromEntries(doc.sections.map(s => [s.id, s.blocks.map(b => b.id)]))
      const steps = Object.fromEntries(doc.sections.map(s => [s.id, { steps: s.steps, at: Object.fromEntries(s.blocks.map(b => [b.id, b.at])) }]))
      await writeFile(join(ctx.outDir, 'outline.json'), JSON.stringify({ config: ctx.config, outline, steps }))
      return { outDir: ctx.outDir, skipped: [] }
    },
    async dev(doc, ctx) {
      const file = join(ctx.outDir, 'dev.json')
      const log: unknown[] = [titles(doc)]
      const save = () => writeFile(file, JSON.stringify(log))
      await save()
      return {
        url: 'fixture://dev',
        async update(next) {
          log.push(titles(next))
          await save()
        },
        async close() {
          log.push('closed')
          await save()
        },
      }
    },
  },
}

export default plugin
