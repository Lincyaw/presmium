/**
 * mdast to the Markdown of notebook cells (K-18). Jupyter front ends render
 * CommonMark with GFM tables, inline HTML and dollar math, not MyST syntax,
 * so MyST-only nodes are first lowered to those (`lowerMyst` of
 * @presmium/kernel): an admonition to a blockquote with a bold title, a
 * dropdown to `<details>`, a footnote to its number, ... myst-to-md then
 * writes the result, which holds only nodes it writes as plain Markdown. A
 * node with no such form keeps its text and is reported as degraded.
 */
import { lowerMyst } from '@presmium/kernel'
import type { LowerOptions, MdastNode } from '@presmium/kernel'
import { writeMd } from 'myst-to-md'
import { VFile } from 'vfile'

export interface MarkdownText {
  text: string
  /** What myst-to-md could not write. */
  problems: string[]
  /** MyST node types the notebook cannot show as they are, e.g. an embed; what text they hold is kept. */
  degraded: string[]
}

/** `urls` maps the URLs of images, links and raw HTML (`LowerOptions.urls`); links to labels keep their text. */
export function toMarkdown(mdast: MdastNode, urls?: LowerOptions['urls']): MarkdownText {
  const lowered = lowerMyst(mdast, { urls, htmlUrls: true })
  const problems: string[] = []
  const parts = (lowered.mdast.children ?? []).map((block) => {
    const file = new VFile()
    // Each block on its own: mdast-util-to-markdown writes a root with any inline child as one line.
    writeMd(file, { type: 'root', children: [block] } as Parameters<typeof writeMd>[1])
    problems.push(...file.messages.map(m => m.reason))
    return String(file.result ?? '')
  })
  return { text: parts.filter(Boolean).join('\n\n'), problems, degraded: lowered.degraded }
}
