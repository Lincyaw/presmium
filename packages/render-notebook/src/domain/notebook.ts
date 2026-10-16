/**
 * IR to a Jupyter notebook in nbformat 4.5 (docs/ir.md section 6). Each
 * section opens with its title; narration and visual Markdown become Markdown
 * cells, consecutive ones merged into one; code in the kernel's language
 * becomes a code cell with the recorded outputs (nbformat outputs as they
 * were recorded, numbered in order; hidden source for `echo: false`, P-102),
 * other code a fenced block.
 * A component is rendered by its plugin's notebook extension, else by its
 * `fallback`, else by a note that links to the web version, and is then
 * listed in the build report. Markdown is written in the form Jupyter
 * renders (./markdown.ts); MyST nodes it has no form for are listed as
 * degraded. Steps do not exist in a notebook: every block is shown in its
 * final state. The URLs of images and links in the blocks' Markdown, and the
 * `assets` of components, go through `media`, which can point local files at
 * copies. The words the notebook adds are in the deck's language.
 */
import { errorMessage, isRecord, languageId, withProp } from '@presmium/kernel'
import type {
  CodeNode,
  ComponentNode,
  IRBlock,
  IRDocument,
  IRNode,
  IRSection,
  Locale,
  MdastNode,
  RecordedRun,
  RendererExtension,
  RunOutput,
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
 * list (a string is a Markdown cell). A Markdown cell may give `mdast`
 * instead of `source`: the renderer writes it as it writes the deck's
 * Markdown, MyST lowered, local files copied, degradations reported (C-6).
 * The renderer fills in `id` and `metadata.presmium`; returning undefined
 * falls back to the `fallback`.
 */
export type NotebookCellInput = string | {
  cell_type: 'markdown' | 'code' | 'raw'
  source: string | string[]
  metadata?: Record<string, unknown>
  /** Code cells only: nbformat outputs. */
  outputs?: unknown[]
  execution_count?: number | null
} | {
  cell_type: 'markdown'
  mdast: MdastNode
  metadata?: Record<string, unknown>
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
  /** Language of the words the notebook adds. */
  locale: Locale
  /** Where a section is in the web version; a component the notebook cannot show links to it. */
  webLink?: (section: IRSection) => string | undefined
  /** The plugin extension that renders a component (`RenderContext.extensionFor`). */
  extensionFor: (node: ComponentNode) => ComponentRenderer | undefined
  /**
   * The URL to use for a local file's URL in a block (images and links of its
   * Markdown, `assets` of a component), given the block's source position it
   * is relative to; undefined keeps the URL. Only what the notebook shows goes
   * through it.
   */
  media?: (url: string, source: SourcePos) => string | undefined
}

export interface NotebookResult {
  notebook: Notebook
  /** Blocks the notebook does not show, with the reason. */
  skipped: { section: string, block: string, reason: string }[]
  problems: { message: string, source: SourcePos }[]
  /** Blocks shown without the MyST nodes Jupyter has no form for, e.g. an embed; their text is kept. */
  degraded: { section: string, block: string, nodes: string[], source: SourcePos }[]
  /** Notes in place of components that could not link to the web version (`webLink` gave none). */
  unlinked: number
}

type ComponentRenderer = (node: ComponentNode, block: IRBlock) => unknown

/** The words the notebook adds, in the deck's language. */
const MESSAGES = {
  'zh-CN': {
    web: '网页版',
    note: (name: MdastNode, web: MdastNode): MdastNode[] => [text('交互组件 '), name, text(' 需要在'), web, text('中查看。')],
  },
  'en': {
    web: 'the web version',
    note: (name: MdastNode, web: MdastNode): MdastNode[] => [text('The interactive component '), name, text(' can only be used in '), web, text('.')],
  },
} satisfies Record<Locale, unknown>

function text(value: string): MdastNode {
  return { type: 'text', value }
}

export function support(node: IRNode, extensions: RendererExtension[]): Support {
  return node.type === 'component' && !extensions.some(e => (!node.plugin || e.plugin === node.plugin) && e.components?.[node.name]) ? 'degraded' : 'full'
}

export function renderNotebook(doc: IRDocument, options: NotebookOptions): NotebookResult {
  const { kernel } = options
  const out: NotebookResult = {
    notebook: { nbformat: 4, nbformat_minor: 5, metadata: { kernelspec: kernel, language_info: { name: kernel.language } }, cells: [] },
    skipped: [],
    problems: [],
    degraded: [],
    unlinked: 0,
  }
  if (doc.meta.title) out.notebook.metadata.title = doc.meta.title
  const ids = new Set<string>()
  const executions = { count: 0 }
  for (const section of doc.sections) renderSection(section, options, out, ids, executions)
  return out
}

function renderSection(section: IRSection, options: NotebookOptions, out: NotebookResult, ids: Set<string>, executions: { count: number }): void {
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
  /** The Markdown of a block (or of the section title), its local files mapped by `options.media`, its problems reported. */
  const written = (mdast: MdastNode, block?: IRBlock): string => {
    const { media } = options
    const { text, problems, degraded } = toMarkdown(mdast, media && block ? url => media(url, block.source) : undefined)
    const where = { section: section.id, block: block?.id ?? 'title', source: block?.source ?? section.source }
    for (const problem of problems) out.problems.push({ message: `${where.section}#${where.block}: ${problem}`, source: where.source })
    if (degraded.length) out.degraded.push({ ...where, nodes: degraded })
    return text
  }
  const markdown = (mdast: MdastNode, block?: IRBlock) => {
    const text = written(mdast, block)
    if (!text) return
    pending ??= { parts: [], blocks: [] }
    pending.parts.push(text)
    if (block && !pending.blocks.includes(block.id)) pending.blocks.push(block.id)
  }

  const code = (node: CodeNode, block: IRBlock) => {
    const shown = node.echo !== false
    const caption = codeCaption(node)
    if (caption && shown) markdown(caption, block)
    if (languageId(node.lang) === languageId(options.kernel.language)) {
      flush()
      const runs = node.outputs ?? []
      const count = runs.length ? ++executions.count : null
      const hidden = shown ? {} : { metadata: { jupyter: { source_hidden: true } } }
      cell('code', node.value, [block.id], { execution_count: count, outputs: cellOutputs(runs, count), ...hidden })
    } else {
      const output = (node.outputs ?? []).map(run => run.stdout + run.stderr).join('').trimEnd()
      const blocks: MdastNode[] = shown ? [{ type: 'code', lang: node.lang, value: node.value }] : []
      if (output) blocks.push({ type: 'code', lang: 'text', value: output })
      if (blocks.length) markdown({ type: 'root', children: blocks }, block)
    }
    for (const variant of node.variants ?? []) {
      markdown({ type: 'root', children: [
        { type: 'paragraph', children: [{ type: 'strong', children: [{ type: 'text', value: variant.label }] }] },
        { type: 'code', lang: node.lang, value: variant.value },
      ] }, block)
    }
  }

  const component = (original: ComponentNode, block: IRBlock) => {
    const node = published(original, block, options)
    const render = options.extensionFor(node)
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
            if ('mdast' in input) {
              cell('markdown', written(input.mdast, block), [block.id], { metadata: input.metadata })
              continue
            }
            const run = input.cell_type === 'code' ? { execution_count: input.execution_count ?? null, outputs: input.outputs ?? [] } : {}
            cell(input.cell_type, input.source, [block.id], { metadata: input.metadata, ...run })
          }
          return
        }
      } catch (error) {
        out.problems.push({ message: `${section.id}#${block.id}: the notebook extension of ${node.name} failed: ${errorMessage(error)}`, source: block.source })
      }
    }
    if (node.fallback) return markdown(node.fallback, block)
    const link = options.webLink?.(section)
    if (!link) out.unlinked++
    markdown(webNote(node, MESSAGES[options.locale], link), block)
    const reason = render ? `the notebook extension of ${node.name} rendered nothing and it has no fallback` : `component ${node.name} has no notebook extension or fallback`
    out.skipped.push({ section: section.id, block: block.id, reason: `${reason}; a note points to the web version` })
    node.children?.forEach(renderBlock)
  }

  const renderBlock = (block: IRBlock): void => {
    const { node } = block
    if (node.type === 'markdown') markdown(node.mdast, block)
    else if (node.type === 'code') code(node, block)
    else component(node, block)
  }

  if (section.title) markdown({ type: 'heading', depth: Math.min(6, Math.max(1, section.depth)), children: [{ type: 'text', value: section.title }] })
  section.blocks.forEach(renderBlock)
  flush()
}

/** A component with its `assets` props set to the URLs of the notebook's copies of the files. */
function published(node: ComponentNode, block: IRBlock, options: NotebookOptions): ComponentNode {
  const { media } = options
  if (!node.assets || !media) return node
  let props = node.props
  for (const [path, url] of Object.entries(node.assets)) props = withProp(props, path, media(url, block.source) ?? url)
  return { ...node, props }
}

function cellInputs(value: unknown): NotebookCellInput[] | undefined {
  if (value === undefined || value === null) return undefined
  const cells = Array.isArray(value) ? value : [value]
  for (const c of cells) {
    const source = (c: Record<string, unknown>) => typeof c.source === 'string' || (Array.isArray(c.source) && c.source.every((s: unknown) => typeof s === 'string'))
    const mdast = (c: Record<string, unknown>) => c.cell_type === 'markdown' && isRecord(c.mdast) && typeof c.mdast.type === 'string'
    const valid = typeof c === 'string' || (isRecord(c) && ['markdown', 'code', 'raw'].includes(c.cell_type as string) && (source(c) || mdast(c)))
    if (!valid) throw new Error(`returned ${JSON.stringify(c)?.slice(0, 80)}, which is not a notebook cell`)
  }
  return cells as NotebookCellInput[]
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

/** The note in place of a component, linked to the web version where `url` says it is. */
function webNote(node: ComponentNode, t: (typeof MESSAGES)[Locale], url?: string): MdastNode {
  const web = url ? { type: 'link', url, children: [text(t.web)] } : text(t.web)
  return { type: 'blockquote', children: [{ type: 'paragraph', children: t.note({ type: 'inlineCode', value: node.name }, web) }] }
}

/** Text MIME types, which nbformat writes as lines. */
const TEXT_TYPE = /^text\/|^image\/svg\+xml$/

/**
 * The outputs of a code cell: the recorded nbformat outputs as they are
 * (multiline text as lines; a result numbered with the cell), or, for runs
 * recorded without them, their text streams.
 */
function cellOutputs(runs: RecordedRun[], count: number | null): unknown[] {
  if (!runs.some(run => run.outputs)) return streams(runs)
  return runs.flatMap(run => run.outputs ?? streams([run])).map((output) => {
    const o = output as RunOutput
    if (o.output_type === 'stream') return { ...o, text: lines(Array.isArray(o.text) ? o.text.join('') : o.text) }
    if (o.output_type === 'error') return o
    const data = Object.fromEntries(Object.entries(o.data).map(([type, value]) => [type, TEXT_TYPE.test(type) && typeof value === 'string' ? lines(value) : value]))
    return { ...o, data, metadata: o.metadata ?? {}, ...o.output_type === 'execute_result' ? { execution_count: count } : {} }
  })
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

/** Unique cell id (nbformat 4.5: 1 to 64 characters of [A-Za-z0-9_-]) made from the section id. */
function cellId(section: IRSection, ids: Set<string>): string {
  const base = section.id.replace(/[^\w-]/g, '').slice(0, 48) || `section-${section.index}`
  let n = 1
  while (ids.has(`${base}-${n}`)) n++
  ids.add(`${base}-${n}`)
  return `${base}-${n}`
}
