import { lowerMyst } from '@lincyaw/kernel'
import type { LowerOptions, MdastNode } from '@lincyaw/kernel'
import { writeMd } from 'myst-to-md'
import { VFile } from 'vfile'

export interface MarkdownText {
  text: string
  problems: string[]
  degraded: string[]
}

/** A Markdown tree as Markdown a notebook shows: MyST lowered to what Jupyter renders, then written block by block. */
export function lowerToMarkdown(mdast: MdastNode, urls?: LowerOptions['urls']): MarkdownText {
  const lowered = lowerMyst(mdast, { urls, htmlUrls: true })
  const problems: string[] = []
  const parts = (lowered.mdast.children ?? []).map((block) => {
    const file = new VFile()
    writeMd(file, { type: 'root', children: [block] } as Parameters<typeof writeMd>[1])
    problems.push(...file.messages.map(m => m.reason))
    return String(file.result ?? '')
  })
  return { text: parts.filter(Boolean).join('\n\n'), problems, degraded: lowered.degraded }
}
