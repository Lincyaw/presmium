/**
 * The `ServerHost` of `presmium dev` (docs/architecture.md 10.2): its one
 * document is the deck, as the dev loop last compiled it; checks, builds and
 * runs of a code block work on that compilation, with its executors. The
 * student view is that compilation as the audience `student` sees it (P-55).
 */
import { buildView, runBlock, STUDENT } from '@presmium/compiler'
import type { Compilation } from '@presmium/compiler'
import type { ServerHost } from '@presmium/server'

export function devHost(latest: () => Compilation | undefined): ServerHost {
  const current = (document: string): Compilation => {
    const compilation = latest()
    if (document !== '' || !compilation) throw new Error(document === '' ? 'the deck is still compiling' : `no document ${JSON.stringify(document)} in presmium dev`)
    return compilation
  }
  return {
    async documents() {
      const compilation = latest()
      return compilation ? [{ dir: '', title: compilation.doc.meta.title, lang: compilation.doc.meta.lang }] : []
    },
    async compile(document, view = 'full') {
      // The student view (`tutor` tokens, P-55): the deck as the audience `student` sees it.
      const compilation = current(document)
      const doc = view === 'student' ? compilation.forAudience(STUDENT) : compilation.doc
      return { doc, diagnostics: doc.diagnostics }
    },
    async check(document) {
      const compilation = current(document)
      return [...compilation.doc.diagnostics, ...await compilation.check()]
    },
    async build(document, options = {}) {
      const report = await buildView(current(document), options)
      return { outputs: report.outputs.map(({ renderer, outDir }) => ({ renderer, outDir })), findings: report.findings }
    },
    // The executor and the execution options of the compilation; recordings are neither read nor written.
    run: async (document, target, signal) => runBlock(current(document), target, signal),
  }
}
