import type { Finding, IRDocument, IRSection } from '@lincyaw/kernel'

export interface LiveUpdate {
  order: string[]
  sections: IRSection[]
  diagnostics: Finding[]
  document?: Omit<IRDocument, 'sections' | 'diagnostics'>
}

function key(value: unknown): string {
  return JSON.stringify(value)
}
const documentFields = ({ sections: _sections, diagnostics: _diagnostics, ...document }: IRDocument) => document

export function diffDocuments(prev: IRDocument, next: IRDocument): LiveUpdate | undefined {
  const old = new Map(prev.sections.map(s => [s.id, s]))
  const sections = next.sections.filter(s => {
    const previous = old.get(s.id)
    return previous !== s && (previous === undefined || key(previous) !== key(s))
  })
  const order = next.sections.map(s => s.id)
  const update: LiveUpdate = { order, sections, diagnostics: next.diagnostics }
  const document = documentFields(next)
  if (key(documentFields(prev)) !== key(document)) update.document = document
  const reordered = key(order) !== key(prev.sections.map(s => s.id))
  const changed = sections.length > 0 || reordered || update.document || key(prev.diagnostics) !== key(next.diagnostics)
  return changed ? update : undefined
}

export function applyUpdate(doc: IRDocument, update: LiveUpdate): IRDocument {
  const known = new Map(doc.sections.map(s => [s.id, s]))
  for (const section of update.sections) known.set(section.id, section)
  return {
    ...(update.document ?? doc),
    sections: update.order.flatMap(id => known.get(id) ?? []),
    diagnostics: update.diagnostics,
  }
}

export function sectionDiagnostics(section: IRSection, diagnostics: readonly Finding[]): Finding[] {
  const ranges = [section.source, ...section.blocks.map(b => b.source)]
  return diagnostics.filter(({ source }) => source?.line !== undefined && ranges.some(range =>
    range.file === source.file && source.line! >= range.line && source.line! <= (range.endLine ?? range.line)))
}
