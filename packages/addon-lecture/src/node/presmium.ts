import { createRequire } from 'node:module'
import type { PresmiumNodePlugin } from '@lincyaw/kernel'
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
  kernel: '^1.0.0',
  checks: [lectureCheck],
  renderer: lectureRenderer,
  server: lectureServer,
  roles: [cueRole, sayRole],
  passes: [keepPass],
  services: ctx => [[LECTURE_DECK, { deckDir: ctx.deckDir, workspaceRoot: ctx.workspaceRoot }]],
  tools: lectureTools,
}

export default plugin
