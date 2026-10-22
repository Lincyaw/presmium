import { createRequire } from 'node:module'
import type { PresmiumNodePlugin } from '@lincyaw/kernel'
import { CLASSROOM_ID } from '../domain/index.ts'
import { classroomPass } from './classroom-pass.ts'
import { exerciseDirective, predictDirective, pulseDirective, questionBoxDirective, quizDirective } from './directives.ts'
import { predictFallbacksPass } from './fallbacks.ts'
import { notebookContribution } from './notebook.ts'
import { revealsPass } from './reveals.ts'

const { version } = createRequire(import.meta.url)('../../package.json') as { version: string }

const plugin: PresmiumNodePlugin = {
  id: CLASSROOM_ID,
  version,
  kernel: '^1.0.0',
  directives: [quizDirective, exerciseDirective, questionBoxDirective, pulseDirective, predictDirective],
  passes: [revealsPass, classroomPass, predictFallbacksPass],
  rendererExtensions: { notebook: notebookContribution },
}

export default plugin
