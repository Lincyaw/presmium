import { createRequire } from 'node:module'
import type { PresmiumNodePlugin } from '@presmium/kernel'
import { CLASSROOM_ID } from '../domain/index.ts'
import { exerciseDirective, predictDirective, pulseDirective, questionBoxDirective, quizDirective } from './directives.ts'
import { rendererExtensions } from './extensions.ts'
import { placesPass, predictFallbacksPass } from './places.ts'
import { revealsPass } from './reveals.ts'

const { version } = createRequire(import.meta.url)('../../package.json') as { version: string }

const plugin: PresmiumNodePlugin = {
  id: CLASSROOM_ID,
  version,
  kernel: '^1.0.0',
  directives: [quizDirective, exerciseDirective, questionBoxDirective, pulseDirective, predictDirective],
  passes: [revealsPass, placesPass, predictFallbacksPass],
  rendererExtensions,
}

export default plugin
