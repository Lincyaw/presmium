import { htmlAsText } from '@lincyaw/kernel'
import type { MdastNode } from '@lincyaw/kernel'
import { AnsiUp } from 'ansi_up'
import { fromMarkdown } from 'mdast-util-from-markdown'
import { gfmFromMarkdown } from 'mdast-util-gfm'
import { gfm } from 'micromark-extension-gfm'

/** What the outputs of code runs are read with, loaded once a page shows one (`deferred.ts`). */
export interface OutputParsers {
  /** Terminal text with its ANSI colours, as HTML. */
  ansi(text: string): string
  /** A Markdown output as MDAST, its raw HTML as text. */
  markdown(text: string): MdastNode
}

export const OUTPUT_PARSERS: OutputParsers = {
  ansi: text => new AnsiUp().ansi_to_html(text),
  markdown: text => htmlAsText(fromMarkdown(text, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] }) as unknown as MdastNode),
}
