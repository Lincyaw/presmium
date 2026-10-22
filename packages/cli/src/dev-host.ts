import { buildSummary, buildToDist, runBlock } from '@lincyaw/compiler'
import type { Compilation } from '@lincyaw/compiler'
import type { ServerHost } from '@lincyaw/server'

export function devHost(latest: () => Compilation | undefined): ServerHost {
  const current = (document: string): Compilation => {
    const compilation = latest()
    if (document !== '' || !compilation) throw new Error(document === '' ? 'the deck is still compiling' : `no document ${JSON.stringify(document)} in presmium dev`)
    return compilation
  }
  return {
    get workspaceRoot() { return latest()?.workspaceRoot },
    async documents() {
      const compilation = latest()
      return compilation ? [{ dir: '', title: compilation.doc.meta.title, lang: compilation.doc.meta.lang }] : []
    },
    async compile(document) {
      const { doc } = current(document)
      return { doc, diagnostics: doc.diagnostics }
    },
    async check(document) {
      const compilation = current(document)
      return [...compilation.doc.diagnostics, ...await compilation.check()]
    },
    async build(document, options = {}) {
      return buildSummary(await buildToDist(current(document), options))
    },
    run: async (document, target, signal) => runBlock(current(document), target, signal),
  }
}
