/**
 * The source and the preview following each other (P-124, docs/design-dsh.md
 * 4.1): the preview protocol carries only ids of sections and blocks; the IR's
 * source positions (paths relative to the workspace root, `GET ir`) say which
 * lines of which file a block or a section comes from.
 */
import { irBlocks } from '@presmium/kernel'
import type { IRDocument, SourcePos } from '@presmium/kernel'

/** A place of the document: a section, and a block of it (none for its heading), with its source. */
export interface Place {
  section: string
  block?: string
  source: SourcePos
}

/** The block holding `line` of `file`, the innermost; else the section whose heading or span holds it. */
export function placeAt(doc: IRDocument, file: string, line: number): Place | undefined {
  let found: Place | undefined
  let span = Number.POSITIVE_INFINITY
  for (const section of doc.sections) {
    const places: Place[] = [{ section: section.id, source: section.source }, ...[...irBlocks(section.blocks)].map(block => ({ section: section.id, block: block.id, source: block.source }))]
    for (const place of places) {
      const { source } = place
      const end = source.endLine ?? source.line
      if (source.file !== file || line < source.line || line > end) continue
      if (end - source.line < span || (end - source.line === span && place.block)) {
        found = place
        span = end - source.line
      }
    }
  }
  return found
}

/** The place of a block or a section in the IR, by their ids. */
export function placeOf(doc: IRDocument, section: string, block?: string): Place | undefined {
  const found = doc.sections.find(s => s.id === section)
  if (!found) return undefined
  if (!block) return { section, source: found.source }
  const inner = [...irBlocks(found.blocks)].find(b => b.id === block)
  return inner ? { section, block, source: inner.source } : { section, source: found.source }
}
