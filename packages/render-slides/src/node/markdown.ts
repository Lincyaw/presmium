/**
 * Standard mdast to the Markdown Slidev reads, through mdast-util-to-markdown
 * with GFM. MyST nodes are lowered to standard ones first (`lowerMyst` of
 * @presmium/kernel, see ./slidev.ts).
 */
import type { MdastNode } from '@presmium/kernel'
import { gfmToMarkdown } from 'mdast-util-gfm'
import { toMarkdown } from 'mdast-util-to-markdown'
import type { Options } from 'mdast-util-to-markdown'
import { bundledLanguages } from 'shiki/langs'

const OPTIONS = {
  bullet: '-',
  extensions: [gfmToMarkdown()],
  // A bare `$` would start KaTeX math in Slidev.
  unsafe: [{ character: '$', inConstruct: 'phrasing' }],
} as unknown as Options

/** Serializes a tree of standard mdast nodes. */
export function markdown(tree: MdastNode): string {
  return toMarkdown(tree as Parameters<typeof toMarkdown>[0], OPTIONS).trim()
}

/** The language of a code block for Slidev: one Shiki does not know would fail the build, so it is shown as plain text. */
export function codeLang(lang: unknown): string {
  const name = typeof lang === 'string' ? lang.toLowerCase() : ''
  return name in bundledLanguages ? name : 'text'
}
