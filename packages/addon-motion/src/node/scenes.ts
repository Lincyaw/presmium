import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { SCENE_EXTENSIONS, SCENE_NAME, SCENES_DIR } from '../domain/index.ts'

export const SCENES_MODULE = 'virtual:presmium-motion/scenes'

/** The scene name of a supported file below the document's scenes directory. */
export function sceneName(deckDir: string, file: string): string | undefined {
  const path = relative(join(deckDir, SCENES_DIR), file).split(sep).join('/')
  const ext = SCENE_EXTENSIONS.find(ext => path.endsWith(ext))
  const name = ext && path.slice(0, -ext.length)
  return name && SCENE_NAME.test(name) ? name : undefined
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
      const name = sceneName(deckDir, path)
      if (name === undefined) continue
      const known = scenes.get(name)
      if (!known || SCENE_EXTENSIONS.indexOf(ext) < SCENE_EXTENSIONS.findIndex(e => known.endsWith(e))) scenes.set(name, path)
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

