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

/**
 * A scene of another document, shown here through a synced block: its name is the path from this document's folder to
 * the file without its extension (`../other/scenes/bubble`), so it never collides with this document's own scenes.
 */
export function syncedSceneName(deckDir: string, file: string): string | undefined {
  const parts = file.split(sep), at = parts.lastIndexOf(SCENES_DIR)
  if (at < 1) return undefined
  const owner = parts.slice(0, at).join(sep)
  if (sceneName(owner, file) === undefined) return undefined
  const ext = SCENE_EXTENSIONS.find(ext => file.endsWith(ext))!
  return relative(deckDir, file.slice(0, -ext.length)).split(sep).join('/')
}

/** The configuration key under which the definitions pass records the synced scenes' files by name. */
export const SYNCED_SCENES = 'syncedScenes'

/**
 * The source of `virtual:presmium-motion/scenes`: each scene of the deck, by name, to an import of its file, and the
 * scenes of other documents its synced blocks show (`synced`, by name).
 */
export function scenesModule(deckDir: string, synced: Record<string, string> = {}): string {
  const entries = [...deckScenes(deckDir), ...Object.entries(synced)].map(([name, file]) => `  ${JSON.stringify(name)}: () => import(${JSON.stringify(file)}),`)
  return `export default {\n${entries.join('\n')}\n}\n`
}

