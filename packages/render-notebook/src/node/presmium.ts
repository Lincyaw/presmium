/**
 * The notebook renderer (P-75): writes the IR as one Jupyter notebook,
 * `<outDir>/<entry name>.ipynb` (see ../domain/notebook.ts).
 *
 * Configuration, `renderers.notebook` in the frontmatter:
 *   kernel   the kernel name (default python3), or { name, language, display_name };
 *            code in the kernel's language becomes code cells
 *   webUrl   URL of the web version, linked from components the notebook cannot show
 *
 * Plugins render their components as cells through `rendererExtensions.notebook`;
 * the cells they return are typed by `NotebookCellInput`.
 */
import { writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import type { PresmiumNodePlugin, RenderContext } from '@presmium/kernel'
import { DEFAULT_KERNEL, renderNotebook, support } from '../domain/notebook.ts'
import type { KernelSpec, NotebookOptions } from '../domain/notebook.ts'

export type { NotebookCellInput } from '../domain/notebook.ts'

const CHECK_ID = 'presmium.notebook'

const plugin: PresmiumNodePlugin = {
  id: CHECK_ID,
  renderer: {
    id: 'notebook',
    support,
    async build(doc, ctx) {
      const { notebook, skipped, problems } = renderNotebook(doc, options(ctx))
      for (const { message, source } of problems) ctx.report({ checkId: CHECK_ID, severity: 'warning', message, source: { file: source.file, line: source.line } })
      const name = basename(doc.meta.entry, extname(doc.meta.entry)) || 'notebook'
      await writeFile(join(ctx.outDir, `${name}.ipynb`), `${JSON.stringify(notebook, null, 1)}\n`)
      return { outDir: ctx.outDir, skipped }
    },
  },
}

export default plugin

function options(ctx: RenderContext): NotebookOptions {
  const warn = (message: string) => ctx.report({ checkId: CHECK_ID, severity: 'warning', message })
  const { kernel, webUrl } = ctx.config
  if (webUrl !== undefined && typeof webUrl !== 'string') warn('renderers.notebook.webUrl must be a URL; components are not linked to the web version')
  return { kernel: kernelSpec(kernel, warn), webUrl: typeof webUrl === 'string' ? webUrl : undefined, extensions: ctx.extensions }
}

function kernelSpec(value: unknown, warn: (message: string) => void): KernelSpec {
  if (value === undefined || value === DEFAULT_KERNEL.name) return DEFAULT_KERNEL
  // A kernel name is read as its language without the version: julia-1.10 -> julia.
  if (typeof value === 'string' && value) return { name: value, display_name: value, language: value.replace(/[-\d.]+$/, '') || value }
  if (typeof value === 'object' && value !== null && 'name' in value && 'language' in value && typeof value.name === 'string' && typeof value.language === 'string') {
    const displayName = 'display_name' in value && typeof value.display_name === 'string' ? value.display_name : value.name
    return { name: value.name, display_name: displayName, language: value.language }
  }
  warn(`renderers.notebook.kernel must be a kernel name or { name, language, display_name }; using ${DEFAULT_KERNEL.name}`)
  return DEFAULT_KERNEL
}
