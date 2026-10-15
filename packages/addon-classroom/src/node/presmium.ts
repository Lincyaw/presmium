import type { PresmiumNodePlugin } from '@presmium/kernel'
import { CLASSROOM_ID } from '../domain/index.ts'
import { exerciseDirective, pulseDirective, questionBoxDirective, quizDirective } from './directives.ts'
import { rendererExtensions } from './extensions.ts'
import { placesPass } from './places.ts'

/**
 * Classroom features (P-63 to P-67): the `{quiz}`, `{exercise}`,
 * `{question-box}` and `{pulse}` directives, the pass that gives their
 * components a place, and their static form in a notebook. They run live in
 * the browser (src/client) over the `session`, `classroomStore` and
 * `executor` services; learner notes need no directive.
 */
const plugin: PresmiumNodePlugin = {
  id: CLASSROOM_ID,
  directives: [quizDirective, exerciseDirective, questionBoxDirective, pulseDirective],
  passes: [placesPass],
  rendererExtensions,
}

export default plugin
