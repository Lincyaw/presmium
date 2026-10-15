import type { IRBlock, IRDocument, IRSection } from '@presmium/kernel'

function* blocksOf(blocks: IRBlock[]): Generator<IRBlock> {
  for (const block of blocks) {
    yield block
    if (block.node.type === 'component' && block.node.children) yield* blocksOf(block.node.children)
  }
}

/**
 * The section at a 1-based line of a source file (P-81): the last section
 * whose heading is in the file at or above the line; in a file included
 * inside a section, the section of the last block from the file at or above
 * the line, else of its first block.
 */
export function sectionAt(doc: IRDocument, file: string, line: number): IRSection | undefined {
  const headed = doc.sections.filter(s => s.source.file === file && s.source.line <= line).at(-1)
  if (headed) return headed
  let first: IRSection | undefined
  let last: { section: IRSection, line: number } | undefined
  for (const section of doc.sections) {
    for (const block of blocksOf(section.blocks)) {
      if (block.source.file !== file) continue
      first ??= section
      if (block.source.line <= line && block.source.line >= (last?.line ?? 0)) last = { section, line: block.source.line }
    }
  }
  return last?.section ?? first ?? (file === doc.meta.entry ? doc.sections[0] : undefined)
}

/** The block at a 1-based line of a source file, e.g. the code node of a `{code-ref}`. */
export function blockAt(doc: IRDocument, file: string, line: number): IRBlock | undefined {
  for (const section of doc.sections) {
    for (const block of blocksOf(section.blocks)) {
      if (block.source.file === file && block.source.line === line) return block
    }
  }
  return undefined
}
