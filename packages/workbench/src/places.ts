import { irBlocks } from '@lincyaw/kernel'
import type { IRDocument, PreviewAnchor, ReviewChange, SourcePos } from '@lincyaw/kernel'

const CHANGED_PLACES = 100

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

/** The lines of the new file a unified diff added or changed; a removal marks the line now in its place. */
function changedLines(diff: string): Set<number> {
  const lines = new Set<number>()
  let line = 0
  for (const text of diff.split('\n')) {
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(text)
    if (hunk) line = Number(hunk[1])
    else if (line === 0) continue
    else if (text.startsWith('+')) lines.add(line++)
    else if (text.startsWith('-')) lines.add(line)
    else if (text.startsWith(' ')) line++
  }
  return lines
}

/** The blocks (or sections) of the document whose source the changes touched, in the order of the changes. */
export function changedPlaces(doc: IRDocument, changes: readonly ReviewChange[]): PreviewAnchor[] {
  const places = new Map<string, PreviewAnchor>()
  for (const change of changes) {
    if (!change.diff || change.kind === 'deleted') continue
    for (const line of changedLines(change.diff)) {
      const place = findPlaceAtLine(doc, change.path, line)
      if (place) places.set(`${place.section}\0${place.block ?? ''}`, { section: place.section, ...place.block ? { block: place.block } : {} })
    }
  }
  return [...places.values()].slice(0, CHANGED_PLACES)
}
