// Test-only web renderer: a site (`Renderer.site`) whose page names the public base it is given,
// so a build of it with the slides is a build of two sites, which deploys as one.
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { PresmiumNodePlugin } from '@lincyaw/kernel'

const plugin: PresmiumNodePlugin = {
  id: 'fixture.site',
  renderer: {
    id: 'web',
    site: true,
    support: () => 'full',
    async build(_doc, ctx) {
      await writeFile(join(ctx.outDir, 'index.html'), `<p>base ${ctx.base}</p>\n`)
      return { outDir: ctx.outDir, skipped: [] }
    },
  },
}

export default plugin
