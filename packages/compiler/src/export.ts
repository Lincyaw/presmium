import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { ExportOutput } from '@lincyaw/kernel'
import { build } from './build.ts'
import type { Compilation } from './compiler.ts'
import { documentExporters } from './renderers.ts'

// Below the export's directory: the builds its exporter asks for, removed once it is done.
const BUILDS = '.build'

export interface ExportOptions {
  /** An empty directory for the files. */
  outDir: string
  /** What the one who asked chose (`ExportContext.options`). */
  options?: Record<string, unknown>
  signal?: AbortSignal
  progress?(phase: string, done?: number, total?: number): void
  log?(line: string): void
}

/** Makes the document's export `id` (a plugin's exporter: the slides as a PDF, the lecture as a video) into `outDir`. */
export async function exportDocument(compilation: Compilation, id: string, options: ExportOptions): Promise<ExportOutput> {
  const found = (await documentExporters(compilation)).find(({ exporter }) => exporter.id === id)
  if (!found) throw new Error(`no plugin of the document exports ${id}`)
  const builds = join(options.outDir, BUILDS)
  try {
    return await found.exporter.run({
      deckDir: compilation.deckDir,
      workspaceRoot: compilation.workspaceRoot,
      config: found.config,
      outDir: options.outDir,
      signal: options.signal ?? new AbortController().signal,
      progress: options.progress ?? (() => {}),
      log: options.log ?? (() => {}),
      options: options.options ?? {},
      async build(renderer, config = {}) {
        const { renderers } = compilation.doc.config
        const configured = { ...compilation, doc: { ...compilation.doc, config: { ...compilation.doc.config, renderers: { ...renderers, [renderer]: { ...renderers[renderer], ...config } } } } }
        const report = await build(configured, { outDir: join(builds, renderer), to: [renderer], base: '/', ...options.log ? { log: options.log } : {} })
        const own = report.outputs.find(output => output.renderer === renderer)
        if (!own) throw new Error(report.findings.filter(f => f.severity === 'error').map(f => f.message).join('; ') || `the ${renderer} renderer made nothing`)
        return own.outDir
      },
    })
  } finally {
    await rm(builds, { recursive: true, force: true })
  }
}
