import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { deckLocale, docBlocks } from '@lincyaw/kernel'
import type { PresmiumNodePlugin } from '@lincyaw/kernel'
import { MOTION_ID, MOTION_MESSAGES, SCENES_DIR } from '../domain/index.ts'
import { deckScenes, sceneName, SCENES_MODULE, scenesModule, SYNCED_SCENES, syncedSceneName } from './scenes.ts'

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
      const synced: Record<string, string> = {}
      for (const { block } of docBlocks(doc)) {
        const { node } = block
        if (node.type !== 'component' || node.definition?.kind !== 'scene'
          || !['deck', MOTION_ID].includes(node.plugin) || node.name !== 'PmScene' && !node.name.startsWith('presmium-definition:')) continue
        node.plugin = MOTION_ID
        node.name = 'PmScene'
        for (const state of block.stepStates ?? []) if (state.parameters) delete state.parameters.scene
        const report = (message: string) => ctx.report({ checkId: MOTION_ID, severity: 'error', message, source: block.source })
        if (node.definition.exportName && node.definition.exportName !== 'default') report(text.defaultExport)
        // A synced block shows a scene of the document it comes from (its ID is `<synced block>~…`, or the synced block's own).
        const other = sceneName(ctx.deckDir, node.definition.file) === undefined ? syncedSceneName(ctx.deckDir, node.definition.file) : undefined
        const scene = other ?? sceneName(ctx.deckDir, node.definition.file)
        if (scene === undefined) { delete node.props.scene; report(text.scenePath) }
        else node.props.scene = scene
        if (other !== undefined) synced[other] = node.definition.file
      }
      if (Object.keys(synced).length) {
        const own = doc.config.presmium[MOTION_ID]
        doc.config.presmium[MOTION_ID] = { ...(typeof own === 'object' && own !== null ? own : {}), [SYNCED_SCENES]: synced }
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
  documentModules: ({ deckDir, config }) => {
    const synced = config[SYNCED_SCENES]
    return { [SCENES_MODULE]: scenesModule(deckDir, typeof synced === 'object' && synced !== null ? synced as Record<string, string> : {}) }
  },
}

export default plugin
