import { docBlocks, nodeMdast } from '@lincyaw/kernel'
import type { IRDocument, MdastNode } from '@lincyaw/kernel'
import { unique } from './sections.ts'

const FOOTNOTE = new Set(['footnoteReference', 'footnoteDefinition'])

export function numberFootnotes(doc: IRDocument, files: readonly string[]): void {
  const byFile = new Map<string, MdastNode[]>(files.map(file => [file, []]))
  const collect = (node: MdastNode, into: MdastNode[]) => {
    if (FOOTNOTE.has(node.type) && typeof node.identifier === 'string') into.push(node)
    node.children?.forEach(child => collect(child, into))
  }
  for (const { block } of docBlocks(doc)) {
    const into = byFile.get(block.source.file) ?? byFile.set(block.source.file, []).get(block.source.file)!
    for (const tree of nodeMdast(block.node)) collect(tree, into)
  }

  const used = new Set<string>()
  for (const nodes of byFile.values()) {
    const rename = new Map<string, string>()
    for (const node of nodes) {
      const id = node.identifier as string
      if (node.type !== 'footnoteDefinition' || rename.has(id)) continue
      rename.set(id, unique(id, used))
    }
    const numbers = new Map<string, number>()
    for (const type of ['footnoteReference', 'footnoteDefinition']) {
      for (const node of nodes) {
        const id = node.identifier as string
        if (node.type === type && !numbers.has(id)) numbers.set(id, numbers.size + 1)
      }
    }
    for (const node of nodes) {
      const id = node.identifier as string
      node.enumerator = String(numbers.get(id))
      node.identifier = rename.get(id) ?? id
    }
  }
}
