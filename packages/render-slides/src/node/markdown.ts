import type { MdastNode } from '@lincyaw/kernel'
import { gfmToMarkdown } from 'mdast-util-gfm'
import { toMarkdown } from 'mdast-util-to-markdown'
import type { Options } from 'mdast-util-to-markdown'
import { bundledLanguages } from 'shiki/langs'

const OPTIONS = {
  bullet: '-',
  extensions: [gfmToMarkdown()],
  unsafe: [{ character: '$', inConstruct: 'phrasing' }],
} as unknown as Options

export function markdown(tree: MdastNode): string {
  return toMarkdown(tree as Parameters<typeof toMarkdown>[0], OPTIONS).trim()
}

export function codeLang(lang: unknown): string {
  const name = typeof lang === 'string' ? lang.toLowerCase() : ''
  return name in bundledLanguages ? name : 'text'
}
