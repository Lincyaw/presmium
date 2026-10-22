import { irBlocks } from '@lincyaw/kernel'
import type { IRBlock, IRDocument, IRSection } from '@lincyaw/kernel'

export function findSectionAtLine(doc: IRDocument, file: string, line: number): IRSection | undefined {
  const headed = doc.sections.filter(s => s.source.file === file && s.source.line <= line).at(-1)
  if (headed) return headed
  let first: IRSection | undefined
  let last: { section: IRSection, line: number } | undefined
  for (const section of doc.sections) {
    for (const block of irBlocks(section.blocks)) {
      if (block.source.file !== file) continue
      first ??= section
      if (block.source.line <= line && block.source.line >= (last?.line ?? 0)) last = { section, line: block.source.line }
    }
  }
  return last?.section ?? first ?? (file === doc.meta.entry ? doc.sections[0] : undefined)
}

export function findBlockAtLine(doc: IRDocument, file: string, line: number): IRBlock | undefined {
  for (const section of doc.sections) {
    for (const block of irBlocks(section.blocks)) {
      if (block.source.file === file && block.source.line === line) return block
    }
  }
  return undefined
}
