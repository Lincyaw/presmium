/**
 * How each view of a document is compiled in `presmium serve` (D8, P-55,
 * docs/architecture.md 10.3): editors and owners see the `full` view, readers
 * (learners) and `tutor` tokens the `student` view. This file alone decides
 * it; until audiences are compiled (WP-87) the student view is the full deck.
 */
import type { Compilation } from '@presmium/compiler'
import type { IRDocument } from '@presmium/kernel'
import type { DocumentView } from '@presmium/server'

/** The views of a document, in the order the server forwards to them. */
export const VIEWS: readonly DocumentView[] = ['full', 'student']

/** The IR a view of a compiled document shows. */
export function viewDocument(compilation: Compilation, _view: DocumentView): IRDocument {
  return compilation.doc
}
