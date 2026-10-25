import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { parseDuration } from '@lincyaw/kernel'
import type { ComponentNode, DirectiveSpec, MdastNode, PresmiumNodePlugin } from '@lincyaw/kernel'
import { MOTION_ID, SCENE_EXTENSIONS, SCENE_NAME, SCENES_DIR } from '../domain/index.ts'
import { deckScenes, sceneFile, SCENES_MODULE, scenesModule } from './scenes.ts'

const { version } = createRequire(import.meta.url)('../../package.json') as { version: string }

const posix = (path: string) => path.split(sep).join('/')

const ASPECT = /^\d+(?:\.\d+)?\s*[/:]\s*\d+(?:\.\d+)?$/
const STARTER = readFileSync(new URL('./scene-starter.txt', import.meta.url), 'utf8')

const scene: DirectiveSpec = {
  name: 'scene',
  arg: true,
  body: true,
  options: { durations: 'list', aspect: 'string', height: 'string', still: 'string' },
  toIR(input, ctx) {
    const report = (message: string, severity: 'error' | 'warning' = 'error') => ctx.report({ checkId: MOTION_ID, severity, message: `{scene}: ${message}` })
    const name = input.arg?.trim() ?? ''
    if (!name) report(`needs the name of a scene of the deck's ${SCENES_DIR}/, e.g. {scene} merge for ${SCENES_DIR}/merge.ts`)
    else if (!SCENE_NAME.test(name)) report(`"${name}" is not a scene name: the path under ${SCENES_DIR}/ without its extension, e.g. merge or bpe/merge`)
    else {
      // Every file the scene could be, so that adding it (or another extension of it) compiles the deck again.
      ctx.watch(...SCENE_EXTENSIONS.map(ext => join(ctx.deckDir, SCENES_DIR, `${name}${ext}`)))
      if (!sceneFile(ctx.deckDir, name)) report(`the deck has no ${SCENES_DIR}/${name}.ts (nor .js, .mjs)`)
    }
    const listed = Array.isArray(input.options.durations) ? input.options.durations as string[] : []
    const durations = listed.map(parseDuration)
    const bad = listed.filter((_, i) => durations[i] === undefined)
    if (bad.length) report(`:durations: takes durations as {cue}\`pause\` does (1.2, 1.2s or 800ms), not ${bad.join(', ')}`)
    const steps = durations.filter((ms): ms is number => ms !== undefined)
    if (steps.length === 0) steps.push(0)
    const aspect = typeof input.options.aspect === 'string' ? input.options.aspect.trim() : undefined
    if (aspect && !ASPECT.test(aspect)) report(`:aspect: takes width/height, e.g. 16/9, not ${aspect}`)
    const height = typeof input.options.height === 'string' ? input.options.height.trim() : undefined
    const caption = input.body.trim()
    const parsed = caption ? ctx.parse(caption) : undefined
    const fallback: MdastNode = { type: 'root', children: [...(parsed?.children as MdastNode[] | undefined) ?? []] }
    // The durations go in the node only: the renderers give them to the component as the prop durations.
    const props: Record<string, unknown> = { scene: name }
    if (aspect && ASPECT.test(aspect)) props.aspect = aspect.replace(':', '/').replace(/\s+/g, '')
    if (height) props.height = height
    if (caption) props.alt = caption.replace(/\s+/g, ' ')
    const node: ComponentNode = { type: 'component', plugin: MOTION_ID, name: 'PmScene', props, durations: steps, fallback }
    const definition = SCENE_NAME.test(name) ? sceneFile(ctx.deckDir, name) : undefined
    if (definition) node.definition = { file: definition, language: definition.endsWith('.ts') ? 'typescript' : 'javascript' }
    const still = typeof input.options.still === 'string' ? input.options.still.trim() : undefined
    if (still) {
      const file = resolve(dirname(ctx.file), still)
      ctx.watch(file)
      if (!existsSync(file)) report(`:still: file not found: ${still}`)
      const url = posix(relative(dirname(ctx.file), file))
      props.still = url
      node.assets = { still: url }
      fallback.children!.unshift({ type: 'paragraph', children: [{ type: 'image', url, alt: caption || name }] })
    }
    return { node, span: steps.length - 1 }
  },
}

const plugin: PresmiumNodePlugin = {
  id: MOTION_ID,
  version,
  kernel: '^1.0.0',
  directives: [scene],
  passes: [{
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
