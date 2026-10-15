/**
 * IR to a Jupyter notebook in nbformat 4.5 (docs/ir.md section 6). Each
 * section opens with its title; narration and visual Markdown become Markdown
 * cells, consecutive ones merged into one; code in the kernel's language
 * becomes a code cell with the recorded outputs, other code a fenced block.
 * A component is rendered by its plugin's notebook extension, else by its
 * `fallback`, else by a note that links to the web version, and is then
 * listed in the build report. Markdown is written in the form Jupyter
 * renders (./markdown.ts); MyST nodes it has no form for are listed as
 * degraded. Steps do not exist in a notebook: every block is shown in its
 * final state. The URLs of images and links in the blocks'
 * Markdown go through `media`, which can point local files at copies.
 */
import type {
  CodeNode,
  ComponentNode,
  IRBlock,
  IRDocument,
  IRNode,
  IRSection,
  MdastNode,
  RecordedRun,
  RendererExtension,
  SourcePos,
  Support,
} from '@presmium/kernel'
import { toMarkdown } from './markdown.ts'

export interface KernelSpec {
  name: string
  display_name: string
  language: string
}

export const DEFAULT_KERNEL: KernelSpec = { name: 'python3', display_name: 'Python 3', language: 'python' }

/**
 * What a plugin's notebook extension returns for a component: one cell or a
 * list (a string is a Markdown cell). The renderer fills in `id` and
 * `metadata.presmium`; returning undefined falls back to the `fallback`.
 */
export type NotebookCellInput = string | {
  cell_type: 'markdown' | 'code' | 'raw'
  source: string | string[]
  metadata?: Record<string, unknown>
  /** Code cells only: nbformat outputs. */
  outputs?: unknown[]
  execution_count?: number | null
}

export interface NotebookCell {
  id: string
  cell_type: 'markdown' | 'code' | 'raw'
  /** `presmium` holds the section and blocks the cell comes from. */
  metadata: Record<string, unknown>
  source: string[]
  outputs?: unknown[]
  execution_count?: number | null
}

export interface Notebook {
  nbformat: 4
  nbformat_minor: 5
  metadata: { kernelspec: KernelSpec, language_info: { name: string }, title?: string }
  cells: NotebookCell[]
}

export interface NotebookOptions {
  kernel: KernelSpec
  /** URL of the web version; a component the notebook cannot show links to `<webUrl>#<section id>`. */
  webUrl?: string
  extensions: RendererExtension[]
  /**
   * The URL to use for an image or link URL of a block's Markdown, given the
   * source file of the block it is relative to; undefined keeps the URL. Only
   * the Markdown the notebook shows goes through it.
   */
  media?: (url: string, file: string) => string | undefined
}

export interface NotebookResult {
  notebook: Notebook
  /** Blocks the notebook does not show, with the reason. */
  skipped: { section: string, block: string, reason: string }[]
  problems: { message: string, source: SourcePos }[]
  /** Blocks shown without the MyST nodes Jupyter has no form for, e.g. an embed; their text is kept. */
  degraded: { section: string, block: string, nodes: string[], source: SourcePos }[]
}

type ComponentRenderer = (node: ComponentNode, block: IRBlock) => unknown

const LANGUAGE_ALIASES: Record<string, string> = { py: 'python', python3: 'python', ipython: 'python', ipython3: 'python' }

export function support(node: IRNode, extensions: RendererExtension[]): Support {
  return node.type === 'component' && !componentRenderer(node, extensions) ? 'degraded' : 'full'
}

export function renderNotebook(doc: IRDocument, options: NotebookOptions): NotebookResult {
  const { kernel } = options
  const out: NotebookResult = {
    notebook: { nbformat: 4, nbformat_minor: 5, metadata: { kernelspec: kernel, language_info: { name: kernel.language } }, cells: [] },
    skipped: [],
    problems: [],
    degraded: [],
  }
  if (doc.meta.title) out.notebook.metadata.title = doc.meta.title
  const ids = new Set<string>()
  const english = typeof doc.meta.lang === 'string' && doc.meta.lang.trim() !== '' && !/^zh\b/i.test(doc.meta.lang.trim())
  for (const section of doc.sections) renderSection(section, options, out, ids, english)
  return out
}

function renderSection(section: IRSection, options: NotebookOptions, out: NotebookResult, ids: Set<string>, english: boolean): void {
  let pending: { parts: string[], blocks: string[] } | undefined

  const cell = (type: NotebookCell['cell_type'], source: string | string[], blocks: string[], extra: Partial<NotebookCell> = {}) => {
    out.notebook.cells.push({
      id: cellId(section, ids),
      cell_type: type,
      ...extra,
      metadata: { ...extra.metadata, presmium: { section: section.id, blocks } },
      source: typeof source === 'string' ? lines(source) : source,
    })
  }
  const flush = () => {
    if (pending) cell('markdown', pending.parts.join('\n\n'), pending.blocks)
    pending = undefined
  }
  const markdown = (mdast: MdastNode, block?: IRBlock) => {
    const { text, problems, degraded } = toMarkdown(mdast)
    const where = { section: section.id, block: block?.id ?? 'title', source: block?.source ?? section.source }
    for (const problem of problems) out.problems.push({ message: `${where.section}#${where.block}: ${problem}`, source: where.source })
    if (degraded.length) out.degraded.push({ ...where, nodes: degraded })
    if (!text) return
    pending ??= { parts: [], blocks: [] }
    pending.parts.push(text)
    if (block && !pending.blocks.includes(block.id)) pending.blocks.push(block.id)
  }

  /** The Markdown of a block, with its URLs mapped by `options.media`. */
  const local = (mdast: MdastNode, block: IRBlock) => {
    const { media } = options
    return media ? relink(mdast, url => media(url, block.source.file)) : mdast
  }

  const code = (node: CodeNode, block: IRBlock) => {
    const caption = codeCaption(node)
    if (caption) markdown(caption, block)
    if (language(node.lang) === language(options.kernel.language)) {
      flush()
      cell('code', node.value, [block.id], { execution_count: null, outputs: streams(node.outputs) })
    } else {
      const output = (node.outputs ?? []).map(run => run.stdout + run.stderr).join('').trimEnd()
      const blocks: MdastNode[] = [{ type: 'code', lang: node.lang, value: node.value }]
      if (output) blocks.push({ type: 'code', lang: 'text', value: output })
      markdown({ type: 'root', children: blocks }, block)
    }
    for (const variant of node.variants ?? []) {
      markdown({ type: 'root', children: [
        { type: 'paragraph', children: [{ type: 'strong', children: [{ type: 'text', value: variant.label }] }] },
        { type: 'code', lang: node.lang, value: variant.value },
      ] }, block)
    }
  }

  const component = (node: ComponentNode, block: IRBlock) => {
    const render = componentRenderer(node, options.extensions)
    if (render) {
      try {
        const cells = cellInputs(render(node, block))
        if (cells) {
          flush()
          for (const input of cells) {
            if (typeof input === 'string') {
              cell('markdown', input, [block.id])
              continue
            }
            const run = input.cell_type === 'code' ? { execution_count: input.execution_count ?? null, outputs: input.outputs ?? [] } : {}
            cell(input.cell_type, input.source, [block.id], { metadata: input.metadata, ...run })
          }
          return
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        out.problems.push({ message: `${section.id}#${block.id}: the notebook extension of ${node.name} failed: ${message}`, source: block.source })
      }
    }
    if (node.fallback) return markdown(local(node.fallback, block), block)
    markdown(webNote(node, section, english, options.webUrl), block)
    const reason = render ? `the notebook extension of ${node.name} rendered nothing and it has no fallback` : `component ${node.name} has no notebook extension or fallback`
    out.skipped.push({ section: section.id, block: block.id, reason: `${reason}; a note points to the web version` })
    node.children?.forEach(renderBlock)
  }

  const renderBlock = (block: IRBlock): void => {
    const { node } = block
    if (node.type === 'markdown') markdown(local(node.mdast, block), block)
    else if (node.type === 'code') code(node, block)
    else component(node, block)
  }

  if (section.title) markdown({ type: 'heading', depth: Math.min(6, Math.max(1, section.depth)), children: [{ type: 'text', value: section.title }] })
  section.blocks.forEach(renderBlock)
  flush()
}

/** The plugin's renderer for this component; by name alone when the node names no plugin. */
function componentRenderer(node: ComponentNode, extensions: RendererExtension[]): ComponentRenderer | undefined {
  const owner = extensions.find(e => (!node.plugin || e.plugin === node.plugin) && e.components?.[node.name])
  return owner?.components?.[node.name]
}

function cellInputs(value: unknown): NotebookCellInput[] | undefined {
  if (value === undefined || value === null) return undefined
  const cells = Array.isArray(value) ? value : [value]
  for (const c of cells) {
    const valid = typeof c === 'string' || (typeof c === 'object' && c !== null
      && ['markdown', 'code', 'raw'].includes(c.cell_type)
      && (typeof c.source === 'string' || (Array.isArray(c.source) && c.source.every((s: unknown) => typeof s === 'string'))))
    if (!valid) throw new Error(`returned ${JSON.stringify(c)?.slice(0, 80)}, which is not a notebook cell`)
  }
  return cells as NotebookCellInput[]
}

/** A copy of `node` with the URLs of its images, links and link definitions mapped by `map`; undefined keeps a URL. */
function relink(node: MdastNode, map: (url: string) => string | undefined): MdastNode {
  const url = (node.type === 'image' || node.type === 'link' || node.type === 'definition') && typeof node.url === 'string' ? map(node.url) : undefined
  const children = node.children?.map(child => relink(child, map))
  return { ...node, ...url === undefined ? {} : { url }, ...children ? { children } : {} }
}

function codeCaption(node: CodeNode): MdastNode | undefined {
  const children: MdastNode[] = []
  if (node.title) children.push({ type: 'strong', children: [{ type: 'text', value: node.title }] })
  const origin = node.origin
  if (origin) {
    const where: MdastNode = { type: 'inlineCode', value: `${origin.file}:${origin.startLine}-${origin.endLine}` }
    if (children.length) children.push({ type: 'text', value: ' ' })
    children.push(origin.permalink ? { type: 'link', url: origin.permalink, children: [where] } : where)
  }
  return children.length ? { type: 'paragraph', children } : undefined
}

/** The note in place of a component, in the deck's language: Chinese for zh-* or none (the default), else English. */
function webNote(node: ComponentNode, section: IRSection, english: boolean, webUrl?: string): MdastNode {
  const text = (value: string): MdastNode => ({ type: 'text', value })
  const web = text(english ? 'the web version' : '网页版')
  const link = webUrl ? { type: 'link', url: `${webUrl.replace(/#.*$/, '')}#${encodeURIComponent(section.id)}`, children: [web] } : web
  const name: MdastNode = { type: 'inlineCode', value: node.name }
  const words = english
    ? [text('The interactive component '), name, text(' can only be used in '), link, text('.')]
    : [text('交互组件 '), name, text(' 需要在'), link, text('中查看。')]
  return { type: 'blockquote', children: [{ type: 'paragraph', children: words }] }
}

/** Recorded runs as nbformat stream outputs. */
function streams(runs: RecordedRun[] = []): unknown[] {
  return (['stdout', 'stderr'] as const).flatMap((name) => {
    const text = runs.map(run => run[name]).join('')
    return text ? [{ output_type: 'stream', name, text: lines(text) }] : []
  })
}

/** nbformat multiline text: lines that keep their newline. */
function lines(text: string): string[] {
  return text ? text.split(/(?<=\n)/) : []
}

function language(lang: string): string {
  const name = lang.trim().toLowerCase()
  return LANGUAGE_ALIASES[name] ?? name
}

/** Unique cell id (nbformat 4.5: 1 to 64 characters of [A-Za-z0-9_-]) made from the section id. */
function cellId(section: IRSection, ids: Set<string>): string {
  const base = section.id.replace(/[^\w-]/g, '').slice(0, 48) || `section-${section.index}`
  let n = 1
  while (ids.has(`${base}-${n}`)) n++
  ids.add(`${base}-${n}`)
  return `${base}-${n}`
}
