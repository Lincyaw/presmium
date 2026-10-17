/**
 * Lecture tracks (P-90, P-130 to P-135; docs/ir.md section 9): the routes
 * the present view records through and the lecture view plays from in
 * `presmium dev` and `presmium serve`, the check `presmium.lecture`, and the
 * `lecture` renderer that publishes the recorded lectures with a build and
 * says the deck's lecture plan through `SPEECH`. The narration's roles
 * `{cue}` and `{say}`, and the agent tools of lectures. Recording and
 * playback run in the browser (`src/client/`); `presmium-lecture export`
 * renders a lecture to a video file.
 */
import { createRequire } from 'node:module'
import type { PresmiumNodePlugin } from '@presmium/kernel'
import { LECTURE_ID } from '../domain/index.ts'
import { lectureCheck } from './check.ts'
import { keepPass } from './plan.ts'
import { lectureRenderer } from './renderer.ts'
import { cueRole, sayRole } from './roles.ts'
import { lectureServer } from './routes.ts'
import { LECTURE_DECK, lectureTools } from './tools.ts'

const { version } = createRequire(import.meta.url)('../../package.json') as { version: string }

const plugin: PresmiumNodePlugin = {
  id: LECTURE_ID,
  version,
  kernel: '^0.1.0',
  checks: [lectureCheck],
  renderer: lectureRenderer,
  server: lectureServer,
  roles: [cueRole, sayRole],
  passes: [keepPass],
  services: ctx => [[LECTURE_DECK, { deckDir: ctx.deckDir, workspaceRoot: ctx.workspaceRoot }]],
  tools: lectureTools,
}

export default plugin
