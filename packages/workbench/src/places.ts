import { irBlocks } from '@lincyaw/kernel'
import type { IRDocument, SourcePos } from '@lincyaw/kernel'

/** A place in the document (a section, or a block of it) and its source. */
export interface PlaceWithSource {
  section: string
  block?: string
  source: SourcePos
}

/** The smallest section or block whose source spans the line of the file; a block wins over a section of the same span. */
export function findPlaceAtLine(doc: IRDocument, file: string, line: number): PlaceWithSource | undefined {
  let found: PlaceWithSource | undefined
  let span = Number.POSITIVE_INFINITY
  for (const section of doc.sections) {
    const places: PlaceWithSource[] = [{ section: section.id, source: section.source }, ...[...irBlocks(section.blocks)].map(block => ({ section: section.id, block: block.id, source: block.source }))]
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

/** The source of a section, or of a block in it; a block that is not in the section gives the section's. */
export function findPlaceSource(doc: IRDocument, section: string, block?: string): PlaceWithSource | undefined {
  const found = doc.sections.find(s => s.id === section)
  if (!found) return undefined
  if (!block) return { section, source: found.source }
  const inner = [...irBlocks(found.blocks)].find(b => b.id === block)
  return inner ? { section, block, source: inner.source } : { section, source: found.source }
}
