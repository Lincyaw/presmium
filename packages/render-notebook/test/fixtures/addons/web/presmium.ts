// Test-only renderer with the id of the web renderer, which builds nothing: the notebook
// renderer links its notes to the web form of the same build.
import type { PresmiumNodePlugin } from '@presmium/kernel'

const plugin: PresmiumNodePlugin = {
  id: 'fixture.web',
  renderer: {
    id: 'web',
    support: () => 'full',
    build: async (_doc, ctx) => ({ outDir: ctx.outDir, skipped: [] }),
  },
}

export default plugin
