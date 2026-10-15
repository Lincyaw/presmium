import { Transformer } from 'markmap-lib'
import { encodeMarkmap } from '../domain/index.ts'

const transformer = new Transformer()

/** Renders the Markdown of a `markmap` code block as a `PmMarkmap` tag (P-41). */
export function renderMarkmap(code: string): string {
  const { root, frontmatter } = transformer.transform(code)
  return `<PmMarkmap data="${encodeMarkmap({ root, options: frontmatter?.markmap })}" />`
}

// A ```markmap or ~~~markmap fence at the start of a line, up to its closing fence.
const FENCE = /^(`{3,}|~{3,})markmap\b[^\n]*\n([\s\S]*?)^\1[ \t]*$/gm

/** Replaces every `markmap` code block of a slide's Markdown with its `PmMarkmap` tag. */
export function replaceMarkmapBlocks(markdown: string): string {
  return markdown.replace(FENCE, (_block, _fence, code: string) => `\n${renderMarkmap(code)}\n`)
}
