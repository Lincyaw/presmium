import { createRequire } from 'node:module'
import { basename, join } from 'node:path'
import { VOICEOVER } from '@lincyaw/kernel'
import type { Exporter, PresmiumNodePlugin } from '@lincyaw/kernel'
import { LECTURE_ID } from '../domain/index.ts'
import { lectureCheck } from './check.ts'
import { exportVideo } from './export.ts'
import { rememberLatestIrPass } from './latest-ir.ts'
import { lectureRenderer } from './renderer.ts'
import { cueRole, sayRole } from './roles.ts'
import { lectureServer } from './routes/server.ts'
import { LECTURE_DECK, lectureTools } from './tools.ts'

const { version } = createRequire(import.meta.url)('../../package.json') as { version: string }

/** The narrated lecture as a WebM video with its captions, as `presmium-lecture export` makes it. */
const videoExporter: Exporter = {
  id: 'video',
  label: { 'zh-CN': '讲授视频', 'en': 'Lecture video' },
  available: (doc) => {
    const named = Object.keys(doc.config.renderers)
    return named.length === 0 || named.includes('lecture')
  },
  async run(ctx) {
    ctx.progress('build')
    const result = await exportVideo({
      deckDir: ctx.deckDir,
      out: join(ctx.outDir, 'lecture.webm'),
      log: ctx.log,
      progress: (done, total) => ctx.progress('frames', done, total),
      signal: ctx.signal,
    })
    return {
      files: [basename(result.file), ...result.captions.map(({ file }) => basename(file))],
      captions: Object.fromEntries(result.captions.map(({ lang, file }) => [lang, basename(file)])),
      warnings: result.warnings,
    }
  },
}

const plugin: PresmiumNodePlugin = {
  id: LECTURE_ID,
  version,
  kernel: '^1.0.0',
  checks: [lectureCheck],
  renderer: lectureRenderer,
  server: lectureServer,
  roles: [cueRole, sayRole],
  passes: [rememberLatestIrPass],
  services: ctx => [[LECTURE_DECK, { deckDir: ctx.deckDir, workspaceRoot: ctx.workspaceRoot }], [VOICEOVER, { version: 1, preview: true }]],
  tools: lectureTools,
  exporters: [videoExporter],
}

export default plugin
