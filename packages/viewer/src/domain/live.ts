import type { Finding, IRDocument, IRSection } from '@presmium/kernel'

/**
 * Live update pushed by a dev server to the IR runtime (docs/ir.md section
 * 8.3): the sections whose content changed, the order of all sections, and
 * the diagnostics of the compilation.
 */
export interface LiveUpdate {
  /** Section ids of the new document, in order. */
  order: string[]
  /** Sections that are new or whose content changed. */
  sections: IRSection[]
  diagnostics: Finding[]
  /** Present when the document metadata or configuration changed. */
  meta?: IRDocument['meta']
  config?: IRDocument['config']
}

/** Content key of a section; equal keys mean an unchanged section. */
function key(value: unknown): string {
  return JSON.stringify(value)
}

/** The update that turns `prev` into `next`; undefined when nothing changed. */
export function diffDocuments(prev: IRDocument, next: IRDocument): LiveUpdate | undefined {
  const old = new Map(prev.sections.map(s => [s.id, key(s)]))
  const sections = next.sections.filter(s => old.get(s.id) !== key(s))
  const order = next.sections.map(s => s.id)
  const update: LiveUpdate = { order, sections, diagnostics: next.diagnostics }
  if (key(prev.meta) !== key(next.meta)) update.meta = next.meta
  if (key(prev.config) !== key(next.config)) update.config = next.config
  const reordered = key(order) !== key(prev.sections.map(s => s.id))
  const changed = sections.length > 0 || reordered || update.meta || update.config || key(prev.diagnostics) !== key(next.diagnostics)
  return changed ? update : undefined
}

/** Applies an update; unchanged sections keep their identity, so a view re-renders only the changed ones. */
export function applyUpdate(doc: IRDocument, update: LiveUpdate): IRDocument {
  const known = new Map(doc.sections.map(s => [s.id, s]))
  for (const section of update.sections) known.set(section.id, section)
  return {
    ...doc,
    meta: update.meta ?? doc.meta,
    config: update.config ?? doc.config,
    sections: update.order.flatMap(id => known.get(id) ?? []),
    diagnostics: update.diagnostics,
  }
}

/** Diagnostics located in a section: in a file and line range of the section or one of its blocks. */
export function sectionDiagnostics(section: IRSection, diagnostics: readonly Finding[]): Finding[] {
  const ranges = [section.source, ...section.blocks.map(b => b.source)]
  return diagnostics.filter(({ source }) => source?.line !== undefined && ranges.some(range =>
    range.file === source.file && source.line! >= range.line && source.line! <= (range.endLine ?? range.line)))
}
