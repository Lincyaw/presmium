import { docBlocks } from '@presmium/kernel'
import type { IRDocument, MdastNode } from '@presmium/kernel'

/** East Asian wide and fullwidth characters, which take two columns of monospaced text. */
const WIDE = /[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿ꀀ-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]|[\u{1F300}-\u{1FAFF}\u{20000}-\u{3FFFD}]/u

/** Columns of the widest line of code: wide characters count two, a tab four. */
export function codeColumns(code: string): number {
  let widest = 0
  for (const line of code.split('\n')) {
    let width = 0
    for (const char of line) width += char === '\t' ? 4 : WIDE.test(char) ? 2 : 1
    widest = Math.max(widest, width)
  }
  return widest
}

function definitions(node: MdastNode, found: (identifier: string) => void): void {
  if (node.type === 'footnoteDefinition' && node.identifier !== undefined) found(String(node.identifier))
  node.children?.forEach(child => definitions(child, found))
}

/**
 * The section holding each footnote definition, by identifier. MyST moves
 * definitions to the end of the document, so a reference may point to
 * another section, or another page.
 */
export function footnoteSections(doc: IRDocument): Map<string, string> {
  const sections = new Map<string, string>()
  for (const { section, block: { node } } of docBlocks(doc)) {
    if (node.type === 'markdown') definitions(node.mdast, identifier => sections.set(identifier, section.id))
  }
  return sections
}
