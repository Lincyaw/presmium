/**
 * How each view of a document is compiled in `presmium serve` (D8, P-55,
 * docs/architecture.md 10.3): the author sees the `full` view, MCP's `tutor`
 * tokens the `student` view: the document as the audience `student` sees it, without the sections and blocks only for other
 * audiences (`{audience} teacher`, `:audience: teacher`), its steps and
 * sections numbered again (`Compilation.forAudience`, WP-87). This file
 * alone decides it.
 */
import { STUDENT } from '@presmium/compiler'
import type { Compilation } from '@presmium/compiler'
import type { IRDocument } from '@presmium/kernel'
import type { DocumentView } from '@presmium/server'

/** The IR a view of a compiled document shows. */
export function viewDocument(compilation: Compilation, view: DocumentView): IRDocument {
  return view === 'student' ? compilation.forAudience(STUDENT) : compilation.doc
}
