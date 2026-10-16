/**
 * The notebook renderer (P-75): writes the IR as one Jupyter notebook,
 * `<outDir>/<entry name>.ipynb` (see ../domain/notebook.ts).
 *
 * Configuration, `renderers.notebook` in the frontmatter:
 *   kernel   the kernel name (default python3), or { name, language, display_name };
 *            code in the kernel's language becomes code cells
 *   webUrl   URL of the web version, linked from components the notebook cannot
 *            show; when the same build builds the web form, they link to it
 *            relatively (`../web/<page>#<section>`, as in the output directory)
 *
 * MyST nodes Jupyter cannot render are written as CommonMark and HTML, and the
 * ones without such a form are reported as degraded (../domain/markdown.ts).
 *
 * Plugins render their components as cells through `rendererExtensions.notebook`;
 * the cells they return are typed by `NotebookCellInput`, and paths in them
 * are relative to the notebook, in `ctx.outDir`. The local files that the
 * images and links it shows point to are copied to `<outDir>/media/` (./media.ts).
 */
import { createRequire } from 'node:module'
import { writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { deckLocale } from '@presmium/kernel'
import type { IRDocument, IRSection, PresmiumNodePlugin, RenderContext } from '@presmium/kernel'
import { sectionLinks, toPages } from '@presmium/web/domain'
import { DEFAULT_KERNEL, renderNotebook, support } from '../domain/notebook.ts'
import type { KernelSpec, NotebookOptions } from '../domain/notebook.ts'
import { localMedia } from './media.ts'

export type { NotebookCellInput } from '../domain/notebook.ts'

const CHECK_ID = 'presmium.notebook'
const { version } = createRequire(import.meta.url)('../../package.json') as { version: string }

const plugin: PresmiumNodePlugin = {
  id: CHECK_ID,
  version,
  kernel: '^0.1.0',
  renderer: {
    id: 'notebook',
    support,
    async build(doc, ctx) {
      const { notebook, skipped, problems, degraded, unlinked } = renderNotebook(doc, { ...options(doc, ctx), media: localMedia(ctx) })
      for (const { message, source } of problems) ctx.report({ checkId: CHECK_ID, severity: 'warning', message, source: { file: source.file, line: source.line } })
      for (const { section, block, nodes, source } of degraded) {
        const message = `${section}#${block}: degraded in the notebook, which has no Jupyter form for ${nodes.join(', ')}; the text is kept`
        ctx.report({ checkId: CHECK_ID, severity: 'warning', message, source: { file: source.file, line: source.line } })
      }
      if (unlinked > 0) {
        ctx.report({ checkId: CHECK_ID, severity: 'info', message: `${unlinked} components the notebook cannot show are noted without a link to the web version; set renderers.notebook.webUrl to link them` })
      }
      const name = basename(doc.meta.entry, extname(doc.meta.entry)) || 'notebook'
      await writeFile(join(ctx.outDir, `${name}.ipynb`), `${JSON.stringify(notebook, null, 1)}\n`)
      return { outDir: ctx.outDir, skipped }
    },
  },
}

export default plugin

function options(doc: IRDocument, ctx: RenderContext): Omit<NotebookOptions, 'media'> {
  const warn = (message: string) => ctx.report({ checkId: CHECK_ID, severity: 'warning', message })
  const { kernel, webUrl } = ctx.config
  if (webUrl !== undefined && typeof webUrl !== 'string') warn('renderers.notebook.webUrl must be a URL; components are not linked to the web version')
  return { kernel: kernelSpec(kernel, warn), locale: deckLocale(ctx.lang), webLink: webLink(doc, ctx, webUrl), extensionFor: ctx.extensionFor }
}

/**
 * Where a section is in the web version: under `webUrl`, else, when this build
 * also builds the web form, its page beside the notebook's directory.
 */
function webLink(doc: IRDocument, ctx: RenderContext, webUrl: unknown): ((section: IRSection) => string) | undefined {
  if (typeof webUrl === 'string') return section => `${webUrl.replace(/#.*$/, '')}#${encodeURIComponent(section.id)}`
  if (!ctx.renderers.includes('web')) return undefined
  const links = sectionLinks(toPages(doc))
  // The site's first page is its directory; a notebook opened from disk needs the file.
  return section => `../web${(links[section.id] ?? '/').replace(/^\/(?=#|$)/, '/index.html')}`
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
