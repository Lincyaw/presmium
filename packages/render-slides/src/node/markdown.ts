/**
 * IR mdast to the Markdown Slidev reads. Standard mdast and GFM go through
 * mdast-util-to-markdown; math becomes `$` / `$$` for Slidev's KaTeX; the MyST
 * nodes a directive may leave in the tree (admonitions, figures, roles) are
 * first reduced to standard mdast.
 */
import type { MdastNode } from '@presmium/kernel'
import { gfmToMarkdown } from 'mdast-util-gfm'
import { toMarkdown } from 'mdast-util-to-markdown'
import type { Options } from 'mdast-util-to-markdown'
import { bundledLanguages } from 'shiki/langs'

const STANDARD = new Set([
  'root', 'paragraph', 'heading', 'thematicBreak', 'blockquote', 'list', 'listItem', 'html', 'code', 'definition',
  'text', 'emphasis', 'strong', 'delete', 'inlineCode', 'break', 'link', 'image', 'linkReference', 'imageReference',
  'footnoteReference', 'footnoteDefinition', 'table', 'tableRow', 'tableCell', 'math', 'inlineMath',
])

/** MyST admonition kinds shown as GitHub alerts, which Slidev renders. */
const ALERTS: Record<string, string> = {
  note: 'NOTE', seealso: 'NOTE', tip: 'TIP', hint: 'TIP', important: 'IMPORTANT',
  warning: 'WARNING', attention: 'WARNING', caution: 'CAUTION', danger: 'CAUTION', error: 'CAUTION',
}

/** MyST inline nodes that have an HTML element of their own. */
const TAGS: Record<string, string> = { subscript: 'sub', superscript: 'sup', underline: 'u', keyboard: 'kbd', abbreviation: 'abbr' }

const OPTIONS = {
  bullet: '-',
  extensions: [gfmToMarkdown()],
  handlers: {
    math: (node: MdastNode) => `$$\n${node.value}\n$$`,
    inlineMath: (node: MdastNode) => `$${node.value}$`,
  },
  // A bare `$` would start KaTeX math in Slidev.
  unsafe: [{ character: '$', inConstruct: 'phrasing' }],
} as unknown as Options

/** Serializes an mdast tree; `url` maps the URL of every image. */
export function markdown(tree: MdastNode, url: (url: string) => string = u => u): string {
  const root = { type: 'root', children: standard(tree, url) }
  return toMarkdown(root as Parameters<typeof toMarkdown>[0], OPTIONS).trim()
}

/** The language of a code block for Slidev: one Shiki does not know would fail the build, so it is shown as plain text. */
export function codeLang(lang: unknown): string {
  const name = typeof lang === 'string' ? lang.toLowerCase() : ''
  return name in bundledLanguages ? name : 'text'
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function standard(node: MdastNode, url: (url: string) => string): MdastNode[] {
  const children = node.children?.flatMap(child => standard(child, url))
  if (node.type === 'root') return children ?? []
  // Slidev compiles slides as Vue templates: `{{` in text must not become an interpolation.
  if (node.type === 'text' && node.value?.includes('{{')) return [{ type: 'html', value: `<span v-pre>${escapeHtml(node.value)}</span>` }]
  if (node.type === 'image' && typeof node.url === 'string') return [{ ...node, url: url(node.url) }]
  if (node.type === 'code') return [{ ...node, lang: codeLang(node.lang), meta: null }]
  if (STANDARD.has(node.type)) return [children ? { ...node, children } : node]
  const tag = TAGS[node.type]
  if (tag) return [{ type: 'html', value: `<${tag}>` }, ...children ?? [], { type: 'html', value: `</${tag}>` }]
  if (node.type === 'admonition') return [{ type: 'blockquote', children: alert(node, children ?? []) }]
  if (node.type === 'admonitionTitle' || node.type === 'definitionTerm') return [{ type: 'paragraph', children: [{ type: 'strong', children: children ?? [] }] }]
  if (children) return children
  return typeof node.value === 'string' ? [{ type: 'text', value: node.value }] : []
}

/** An admonition without a title of its own opens with its alert marker, `[!NOTE]`. */
function alert(node: MdastNode, children: MdastNode[]): MdastNode[] {
  const kind = ALERTS[String(node.kind)]
  if (!kind || node.children?.[0]?.type === 'admonitionTitle') return children
  const [first, ...rest] = children
  const marker: MdastNode = { type: 'html', value: `[!${kind}]\n` }
  return first?.type === 'paragraph' ? [{ ...first, children: [marker, ...first.children ?? []] }, ...rest] : [{ type: 'paragraph', children: [marker] }, ...children]
}
