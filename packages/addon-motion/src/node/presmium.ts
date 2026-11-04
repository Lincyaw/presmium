import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { deckLocale, docBlocks } from '@lincyaw/kernel'
import type { PresmiumNodePlugin } from '@lincyaw/kernel'
import { MOTION_ID, MOTION_MESSAGES, SCENES_DIR } from '../domain/index.ts'
import { deckScenes, sceneName, SCENES_MODULE, scenesModule } from './scenes.ts'

const { version } = createRequire(import.meta.url)('../../package.json') as { version: string }
const STARTER = readFileSync(new URL('./scene-starter.txt', import.meta.url), 'utf8')

const plugin: PresmiumNodePlugin = {
  id: MOTION_ID,
  version,
  kernel: '^1.0.0',
  passes: [{
    name: 'presmium.motion.definitions',
    order: -100,
    run(doc, ctx) {
      const text = MOTION_MESSAGES[deckLocale(ctx.lang)]
      for (const { block } of docBlocks(doc)) {
        const { node } = block
        if (node.type !== 'component' || node.definition?.kind !== 'scene'
          || !['deck', MOTION_ID].includes(node.plugin) || node.name !== 'PmScene' && !node.name.startsWith('presmium-definition:')) continue
        node.plugin = MOTION_ID
        node.name = 'PmScene'
        for (const state of block.stepStates ?? []) if (state.parameters) delete state.parameters.scene
        const report = (message: string) => ctx.report({ checkId: MOTION_ID, severity: 'error', message, source: block.source })
        if (node.definition.exportName && node.definition.exportName !== 'default') report(text.defaultExport)
        const scene = sceneName(ctx.deckDir, node.definition.file)
        if (scene === undefined) { delete node.props.scene; report(text.scenePath) }
        else node.props.scene = scene
      }
    },
  }, {
    name: 'presmium.motion.catalog',
    after: 'execute',
    run(doc, ctx) {
      const scenes = deckScenes(ctx.deckDir)
      ctx.watch(join(ctx.deckDir, SCENES_DIR), ...scenes.values())
      const own = doc.config.presmium[MOTION_ID]
      doc.config.presmium[MOTION_ID] = { ...(typeof own === 'object' && own !== null ? own : {}), scenes: [...scenes.keys()], starter: { language: 'typescript', code: STARTER } }
    },
  }],
  documentModules: ({ deckDir }) => ({ [SCENES_MODULE]: scenesModule(deckDir) }),
}

export default plugin
