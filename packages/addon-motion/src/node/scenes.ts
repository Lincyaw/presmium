import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { SCENE_EXTENSIONS, SCENE_NAME, SCENES_DIR } from '../domain/index.ts'

export const SCENES_MODULE = 'virtual:presmium-motion/scenes'

/** The file of scene `name` in the deck (`scenes/<name>.ts` and the other extensions), if there is one. */
export function sceneFile(deckDir: string, name: string): string | undefined {
  if (!SCENE_NAME.test(name)) return undefined
  return SCENE_EXTENSIONS.map(ext => join(deckDir, SCENES_DIR, `${name}${ext}`)).find(file => existsSync(file))
}

/** The deck's scenes by name: the files under `scenes/`, the first extension of SCENE_EXTENSIONS winning. */
export function deckScenes(deckDir: string): Map<string, string> {
  const root = join(deckDir, SCENES_DIR)
  const scenes = new Map<string, string>()
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir).sort()) {
      const path = join(dir, entry)
      if (statSync(path).isDirectory()) {
        walk(path)
        continue
      }
      const ext = SCENE_EXTENSIONS.find(e => entry.endsWith(e))
      if (!ext) continue
      const name = relative(root, path).slice(0, -ext.length).split(sep).join('/')
      const known = scenes.get(name)
      if (SCENE_NAME.test(name) && (!known || SCENE_EXTENSIONS.indexOf(ext) < SCENE_EXTENSIONS.findIndex(e => known.endsWith(e)))) scenes.set(name, path)
    }
  }
  if (existsSync(root) && statSync(root).isDirectory()) walk(root)
  return scenes
}

/** The source of `virtual:presmium-motion/scenes`: each scene of the deck, by name, to an import of its file. */
export function scenesModule(deckDir: string): string {
  const entries = [...deckScenes(deckDir)].map(([name, file]) => `  ${JSON.stringify(name)}: () => import(${JSON.stringify(file)}),`)
  return `export default {\n${entries.join('\n')}\n}\n`
}

