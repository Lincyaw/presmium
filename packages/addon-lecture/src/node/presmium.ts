/**
 * Lecture tracks (P-90, P-130, P-131, P-137; docs/ir.md section 9): the
 * routes the present view records through and the lecture view plays from
 * in `presmium dev` and `presmium serve`, the check `presmium.lecture`, and
 * the `lecture` renderer that publishes the recorded lectures with a build.
 * Recording and playback run in the browser (`src/client/`).
 */
import { createRequire } from 'node:module'
import type { PresmiumNodePlugin } from '@presmium/kernel'
import { LECTURE_ID } from '../domain/index.ts'
import { lectureCheck } from './check.ts'
import { lectureRenderer } from './renderer.ts'
import { lectureServer } from './routes.ts'

const { version } = createRequire(import.meta.url)('../../package.json') as { version: string }

const plugin: PresmiumNodePlugin = {
  id: LECTURE_ID,
  version,
  kernel: '^0.1.0',
  checks: [lectureCheck],
  renderer: lectureRenderer,
  server: lectureServer,
}

export default plugin
