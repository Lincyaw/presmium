import { createRequire } from 'node:module'
import type { PresmiumNodePlugin } from '@presmium/kernel'
import { CLASSROOM_ID } from '../domain/index.ts'
import { exerciseDirective, predictDirective, pulseDirective, questionBoxDirective, quizDirective } from './directives.ts'
import { rendererExtensions } from './extensions.ts'
import { placesPass, predictFallbacksPass } from './places.ts'
import { revealsPass } from './reveals.ts'

const { version } = createRequire(import.meta.url)('../../package.json') as { version: string }

/**
 * Classroom features (P-63 to P-68): the `{quiz}`, `{exercise}`,
 * `{question-box}`, `{pulse}` and `{predict}` directives, the passes that
 * give a predict what it reveals and every component a place and a static
 * form (a predict's once compile-time execution has run), and their static
 * form in a notebook. They run live in the browser (src/client) over
 * the `session`, `classroomStore` and `executor` services; learner notes need
 * no directive.
 */
const plugin: PresmiumNodePlugin = {
  id: CLASSROOM_ID,
  version,
  kernel: '^1.0.0',
  directives: [quizDirective, exerciseDirective, questionBoxDirective, pulseDirective, predictDirective],
  passes: [revealsPass, placesPass, predictFallbacksPass],
  rendererExtensions,
}

export default plugin
