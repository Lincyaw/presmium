import { createRequire } from 'node:module'
import { writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { deckLocale, WEB_RENDERER_PACKAGE } from '@lincyaw/kernel'
import type { IRDocument, IRSection, PresmiumNodePlugin, RenderContext } from '@lincyaw/kernel'
import { DEFAULT_JUPYTER_KERNEL, notebookSupport, renderNotebook } from '../domain/notebook.ts'
import type { JupyterKernelSpec, NotebookOptions } from '../domain/notebook.ts'
import { localMedia } from './media.ts'

export type { NotebookCellInput } from '../domain/notebook.ts'

/** The notebook renderer's plugin ID, which is also the ID of the checks it reports. */
const PLUGIN_ID = 'presmium.notebook'
const { version } = createRequire(import.meta.url)('../../package.json') as { version: string }

const plugin: PresmiumNodePlugin = {
  id: PLUGIN_ID,
  version,
  kernel: '^1.0.0',
  renderer: {
    id: 'notebook',
    support: notebookSupport,
    async build(doc, ctx) {
      const { notebook, skipped, problems, degraded, unlinked } = renderNotebook(doc, { ...await notebookOptions(doc, ctx), media: localMedia(ctx) })
      for (const { message, source } of problems) ctx.report({ checkId: PLUGIN_ID, severity: 'warning', message, source: { file: source.file, line: source.line } })
      for (const { section, block, nodes, source } of degraded) {
        const message = `${section}#${block}: degraded in the notebook, which has no Jupyter form for ${nodes.join(', ')}; the text is kept`
        ctx.report({ checkId: PLUGIN_ID, severity: 'warning', message, source: { file: source.file, line: source.line } })
      }
      if (unlinked > 0) {
        ctx.report({ checkId: PLUGIN_ID, severity: 'info', message: `${unlinked} components the notebook cannot show are noted without a link to the web version; set renderers.notebook.webUrl to link them` })
      }
      const name = basename(doc.meta.entry, extname(doc.meta.entry)) || 'notebook'
      await writeFile(join(ctx.outDir, `${name}.ipynb`), `${JSON.stringify(notebook, null, 1)}\n`)
      return { outDir: ctx.outDir, skipped }
    },
  },
}

export default plugin

async function notebookOptions(doc: IRDocument, ctx: RenderContext): Promise<Omit<NotebookOptions, 'media'>> {
  const warn = (message: string) => ctx.report({ checkId: PLUGIN_ID, severity: 'warning', message })
  const { kernel, webUrl } = ctx.config
  if (webUrl !== undefined && typeof webUrl !== 'string') warn('renderers.notebook.webUrl must be a URL; components are not linked to the web version')
  return { jupyterKernel: jupyterKernelSpec(kernel, warn), locale: deckLocale(ctx.lang), webLink: await webLink(doc, ctx, webUrl), extensionFor: ctx.extensionFor }
}

async function webLink(doc: IRDocument, ctx: RenderContext, webUrl: unknown): Promise<((section: IRSection) => string) | undefined> {
  if (typeof webUrl === 'string') return section => `${webUrl.replace(/#.*$/, '')}#${encodeURIComponent(section.id)}`
  const web = doc.config.renderers.web?.package ?? WEB_RENDERER_PACKAGE
  if (!ctx.renderers.includes('web') || web !== WEB_RENDERER_PACKAGE) return undefined
  const webDomain = await import('@lincyaw/web/domain').catch(() => undefined)
  if (!webDomain) return undefined
  const links = webDomain.sectionLinks(webDomain.webPages(doc))
  return section => `../web${(links[section.id] ?? '/').replace(/^\/(?=#|$)/, '/index.html')}`
}

/** The Jupyter kernel the configuration `renderers.notebook.kernel` names: a name, or `{ name, language, display_name }`. */
function jupyterKernelSpec(value: unknown, warn: (message: string) => void): JupyterKernelSpec {
  if (value === undefined || value === DEFAULT_JUPYTER_KERNEL.name) return DEFAULT_JUPYTER_KERNEL
  if (typeof value === 'string' && value) return { name: value, display_name: value, language: value.replace(/[-\d.]+$/, '') || value }
  if (typeof value === 'object' && value !== null && 'name' in value && 'language' in value && typeof value.name === 'string' && typeof value.language === 'string') {
    const displayName = 'display_name' in value && typeof value.display_name === 'string' ? value.display_name : value.name
    return { name: value.name, display_name: displayName, language: value.language }
  }
  warn(`renderers.notebook.kernel must be a kernel name or { name, language, display_name }; using ${DEFAULT_JUPYTER_KERNEL.name}`)
  return DEFAULT_JUPYTER_KERNEL
}
