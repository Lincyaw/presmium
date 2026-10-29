import { errorMessage, hasRendererExtension, isRecord, languageId, withPublishedAssets } from '@lincyaw/kernel'
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
  BoundRendererExtension,
  RunOutput,
  SourcePos,
  Support,
} from '@lincyaw/kernel'
import { lowerToMarkdown } from './markdown.ts'
import { NOTEBOOK_MESSAGES } from './messages.ts'
import type { NotebookMessages } from './messages.ts'

/** The Jupyter kernel a notebook names (nbformat's `kernelspec`). */
export interface JupyterKernelSpec {
  name: string
  display_name: string
  language: string
}

export const DEFAULT_JUPYTER_KERNEL: JupyterKernelSpec = { name: 'python3', display_name: 'Python 3', language: 'python' }

export type NotebookCellInput = string | {
  cell_type: 'markdown' | 'code' | 'raw'
  source: string | string[]
  metadata?: Record<string, unknown>
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
  metadata: Record<string, unknown>
  source: string[]
  outputs?: unknown[]
  execution_count?: number | null
}

export interface Notebook {
  nbformat: 4
  nbformat_minor: 5
  metadata: { kernelspec: JupyterKernelSpec, language_info: { name: string }, title?: string }
  cells: NotebookCell[]
}

export interface NotebookOptions {
  jupyterKernel: JupyterKernelSpec
  locale: Locale
  webLink?: (section: IRSection) => string | undefined
  extensionFor: (node: ComponentNode) => ComponentRenderer | undefined
  media?: (url: string, source: SourcePos) => string | undefined
}

export interface NotebookResult {
  notebook: Notebook
  skipped: { section: string, block: string, reason: string }[]
  problems: { message: string, source: SourcePos }[]
  degraded: { section: string, block: string, nodes: string[], source: SourcePos }[]
  unlinked: number
}

type ComponentRenderer = (node: ComponentNode, block: IRBlock) => unknown

function text(value: string): MdastNode {
  return { type: 'text', value }
}

/** How well a notebook shows a node: a component without a notebook extension is degraded. */
const documentLayout = (node: IRNode): boolean => node.type === 'component' && node.plugin === 'presmium.layout' && ['PmColumns', 'PmStack', 'PmTabs'].includes(node.name)
export function notebookSupport(node: IRNode, extensions: BoundRendererExtension[]): Support {
  if (documentLayout(node)) return 'full'
  return node.type === 'component' && !hasRendererExtension(node, extensions) ? 'degraded' : 'full'
}

export function renderNotebook(doc: IRDocument, options: NotebookOptions): NotebookResult {
  const { jupyterKernel } = options
  const out: NotebookResult = {
    notebook: { nbformat: 4, nbformat_minor: 5, metadata: { kernelspec: jupyterKernel, language_info: { name: jupyterKernel.language } }, cells: [] },
    skipped: [],
    problems: [],
    degraded: [],
    unlinked: 0,
  }
  if (doc.meta.title) out.notebook.metadata.title = doc.meta.title
  const cellCounts = new Map<string, number>()
  const executions = { count: 0 }
  for (const section of doc.sections) renderSection(section, options, out, cellCounts, executions)
  return out
}

function renderSection(section: IRSection, options: NotebookOptions, out: NotebookResult, cellCounts: Map<string, number>, executions: { count: number }): void {
  let pending: { parts: string[], blocks: string[] } | undefined

  const cell = (type: NotebookCell['cell_type'], source: string | string[], blocks: string[], extra: Partial<NotebookCell> = {}) => {
    out.notebook.cells.push({
      id: cellId(section, cellCounts),
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
  const written = (mdast: MdastNode, block?: IRBlock): string => {
    const { media } = options
    const { text, problems, degraded } = lowerToMarkdown(mdast, media && block ? url => media(url, block.source) : undefined)
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
    if (languageId(node.lang) === languageId(options.jupyterKernel.language)) {
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
    if (documentLayout(node)) {
      if (typeof node.props.title === 'string' && node.props.title) markdown({ type: 'heading', depth: 3, children: [text(node.props.title)] }, block)
      for (const [index, child] of (node.children ?? []).entries()) {
        const title = node.name === 'PmTabs' && Array.isArray(node.props.tabTitles) ? node.props.tabTitles[index] : undefined
        if (typeof title === 'string' && title) markdown({ type: 'heading', depth: 4, children: [text(title)] }, child)
        renderBlock(child)
      }
      return
    }
    const render = options.extensionFor(node)
    if (render) {
      try {
        const cells = toCellInputs(render(node, block))
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
    markdown(webNote(node, NOTEBOOK_MESSAGES[options.locale], link), block)
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

function published(node: ComponentNode, block: IRBlock, options: NotebookOptions): ComponentNode {
  const { media } = options
  return media ? withPublishedAssets(node, url => media(url, block.source)) : node
}

/** The cells a notebook extension returned; throws when one is not a cell. */
function toCellInputs(value: unknown): NotebookCellInput[] | undefined {
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

function webNote(node: ComponentNode, t: NotebookMessages, url?: string): MdastNode {
  const web = url ? { type: 'link', url, children: [text(t.web)] } : text(t.web)
  return { type: 'blockquote', children: [{ type: 'paragraph', children: t.note({ type: 'inlineCode', value: node.name }, web) }] }
}

const TEXT_TYPE = /^text\/|^image\/svg\+xml$/

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

function streams(runs: RecordedRun[] = []): unknown[] {
  return (['stdout', 'stderr'] as const).flatMap((name) => {
    const text = runs.map(run => run[name]).join('')
    return text ? [{ output_type: 'stream', name, text: lines(text) }] : []
  })
}

function lines(text: string): string[] {
  return text ? text.split(/(?<=\n)/) : []
}

function cellId(section: IRSection, counts: Map<string, number>): string {
  const base = section.id.replace(/[^\w-]/g, '').slice(0, 48) || `section-${section.index}`
  const n = (counts.get(base) ?? 0) + 1
  counts.set(base, n)
  return `${base}-${n}`
}
