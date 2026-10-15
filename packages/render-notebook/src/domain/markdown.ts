/**
 * mdast to the Markdown of notebook cells, written by myst-to-md so MyST
 * content (admonitions, figures, roles) keeps its MyST syntax, which
 * MyST-aware Jupyter front ends render. Math is the exception: every Jupyter
 * front end renders `$...$` and `$$...$$`, not the {math} role or directive,
 * so math nodes are written in dollar syntax.
 */
import type { MdastNode } from '@presmium/kernel'
import { writeMd } from 'myst-to-md'
import { VFile } from 'vfile'

export interface MarkdownText {
  text: string
  /** What myst-to-md could not write, e.g. unsupported node types. */
  problems: string[]
}

/** Inline node types that must sit in a paragraph to be written as one. */
const PHRASING = new Set([
  'text', 'emphasis', 'strong', 'delete', 'inlineCode', 'inlineMath', 'break', 'link', 'linkReference', 'image',
  'imageReference', 'footnoteReference', 'abbreviation', 'subscript', 'superscript', 'crossReference', 'cite', 'underline',
])

/** What a figure, table or code container shows, as opposed to its caption and legend. */
const FIGURE_CONTENT = new Set(['image', 'table', 'code', 'iframe'])

export function toMarkdown(mdast: MdastNode): MarkdownText {
  // A copy without undefined fields: the IR is JSON, and myst-to-md reads some fields' presence and edits nodes.
  const tree = JSON.parse(JSON.stringify(mdast)) as MdastNode
  const blocks = (tree.type === 'root' ? paragraphs(tree.children ?? []) : [tree]).map(normalize)
  const problems: string[] = []
  const parts = blocks.map((block) => {
    const file = new VFile()
    // Each block on its own: mdast-util-to-markdown writes a root with any inline child as one line.
    writeMd(file, { type: 'root', children: [block] } as Parameters<typeof writeMd>[1])
    problems.push(...file.messages.map(m => m.reason))
    return String(file.result ?? '')
  })
  return { text: parts.filter(Boolean).join('\n\n'), problems }
}

/** Runs of inline nodes at the top level, wrapped in paragraphs. */
function paragraphs(nodes: MdastNode[]): MdastNode[] {
  const out: MdastNode[] = []
  let run: MdastNode[] | undefined
  for (const node of nodes) {
    if (!PHRASING.has(node.type)) {
      out.push(node)
      run = undefined
      continue
    }
    if (!run) out.push({ type: 'paragraph', children: run = [] })
    run.push(node)
  }
  return out
}

/**
 * Dollar math, plus the shapes myst-to-md expects from the MyST transforms
 * that the parser alone does not apply: the alignment of a GFM table on the
 * table rather than on its cells, and the caption and legend of a figure.
 */
function normalize(node: MdastNode): MdastNode {
  if (node.type === 'math') return { type: 'html', value: `$$\n${node.value ?? ''}\n$$` }
  if (node.type === 'inlineMath') return { type: 'html', value: `$${node.value ?? ''}$` }
  if (!node.children) return node
  const children = node.children.map(normalize)
  node.children = children
  if (node.type === 'table' && !node.align) node.align = children[0]?.children?.map(cell => cell.align ?? null)
  if (node.type === 'container' && !children.some(c => c.type === 'caption')) {
    // As the MyST figure transform does: the first paragraph is the caption, what follows the legend.
    const content = children.filter(c => FIGURE_CONTENT.has(c.type))
    const [caption, ...legend] = children.filter(c => !FIGURE_CONTENT.has(c.type))
    if (caption) node.children = [...content, { type: 'caption', children: [caption] }, ...legend.length ? [{ type: 'legend', children: legend }] : []]
  }
  return node
}
