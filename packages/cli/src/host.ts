/**
 * The `ServerHost` of `presmium dev` (docs/architecture.md 10.2): its one
 * document is the deck, as the dev loop last compiled it; checks, builds and
 * runs of a code block work on that compilation, with its executors. The
 * student view is that compilation as the audience `student` sees it (P-55).
 */
import { join } from 'node:path'
import { irBlocks } from '@presmium/kernel'
import { build } from '@presmium/compiler'
import type { Compilation } from '@presmium/compiler'
import type { ServerHost } from '@presmium/server'
import { pluginChecks } from './check.ts'

export function devHost(latest: () => Compilation | undefined, deckDir: string): ServerHost {
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
      const doc = view === 'student' ? compilation.forAudience('student') : compilation.doc
      return { doc, diagnostics: doc.diagnostics }
    },
    async check(document) {
      const compilation = current(document)
      return [...compilation.doc.diagnostics, ...await pluginChecks(compilation)]
    },
    async build(document, options = {}) {
      const compilation = current(document)
      // The student view, as `presmium build --audience student` builds it: its translations too, and the files it
      // wrote scanned for what it leaves out (dist/ holds the whole deck's builds as well); one who reads the student
      // view asked for it, so the findings do not quote it.
      const student = options.view === 'student' ? { audience: 'student', quote: false, scan: 'written' as const } : {}
      const report = await build(compilation, { outDir: join(deckDir, 'dist'), to: options.to, ...student })
      return { outputs: report.outputs.map(({ renderer, outDir }) => ({ renderer, outDir })), findings: report.findings }
    },
    async run(document, target, signal) {
      const compilation = current(document)
      const section = compilation.doc.sections.find(s => s.id === target.section)
      const block = section && [...irBlocks(section.blocks)].find(b => b.id === target.block)
      if (!block || block.node.type !== 'code') throw new Error(`no code block ${target.section}/${target.block}`)
      // The executor and the execution options of the compilation; recordings are neither read nor written.
      return compilation.run(block.node, signal)
    },
  }
}
