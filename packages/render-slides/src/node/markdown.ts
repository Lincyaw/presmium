import type { MdastNode } from '@lincyaw/kernel'
import { gfmToMarkdown } from 'mdast-util-gfm'
import { toMarkdown } from 'mdast-util-to-markdown'
import type { Options } from 'mdast-util-to-markdown'

const OPTIONS = {
  bullet: '-',
  extensions: [gfmToMarkdown()],
  unsafe: [{ character: '$', inConstruct: 'phrasing' }],
} as unknown as Options

/** Writes a Markdown tree back as Markdown text, with GitHub's extensions. */
export function stringifyMdast(tree: MdastNode): string {
  return toMarkdown(tree as Parameters<typeof toMarkdown>[0], OPTIONS).trim()
}
