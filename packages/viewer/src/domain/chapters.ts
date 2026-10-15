import type { IRDocument, IRSection } from '@presmium/kernel'

/**
 * A chapter: the sections of one source file (the entry or an `{include}`d
 * file), split again at every chapter title, that is a heading above the
 * section depth (`#` where sections open at `##`, docs/ir.md 2.2). The cover
 * opens the first chapter. The web form shows a chapter per page.
 */
export interface Chapter {
  /** The chapter title, else the title of its first section. */
  title: string
  /** Its sections, in order; the first one opens the chapter. */
  sections: IRSection[]
}

/** Depth of the headings that open sections: the deepest heading that opened one. */
function sectionDepth(doc: IRDocument): number {
  return doc.sections.reduce((depth, section) => Math.max(depth, section.depth), 0)
}

function titles(depth: number, section: IRSection): boolean {
  return section.depth === 0 || section.depth < depth
}

/** Whether a section opens under a title above the section depth: the cover (depth 0) or a chapter title. */
export function isChapterTitle(doc: IRDocument, section: IRSection): boolean {
  return titles(sectionDepth(doc), section)
}

/** The chapters of a document, in order. */
export function chapters(doc: IRDocument): Chapter[] {
  const depth = sectionDepth(doc)
  const result: Chapter[] = []
  let previous: IRSection | undefined
  for (const section of doc.sections) {
    const current = result.at(-1)
    if (!current || section.source.file !== previous?.source.file || titles(depth, section)) {
      result.push({ title: section.title, sections: [section] })
    } else {
      current.sections.push(section)
    }
    previous = section
  }
  return result
}
