import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { literalGlob } from '@lincyaw/kernel/node'
import { SCENE_EXTENSIONS, SCENE_NAME, SCENES_DIR } from '../domain/index.ts'

export const SCENES_MODULE = 'virtual:presmium-motion/scenes'
const RESOLVED = `\0${SCENES_MODULE}`

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

interface ViteServer {
  watcher: { add(path: string): void, on(event: string, listener: (file: string) => void): void }
  moduleGraph: { getModuleById(id: string): unknown, invalidateModule(module: unknown): void }
  ws: { send(payload: { type: 'full-reload' }): void }
}

/** The Vite plugin of both forms: `virtual:presmium-motion/scenes` maps each scene of the deck to an import of its file. */
export function scenesPlugin(deckDir: string) {
  const root = join(deckDir, SCENES_DIR)
  return {
    name: 'presmium:motion-scenes',
    // The scenes come through a virtual module, which Vite's dependency scan does not read: their files are scan entries,
    // so the libraries they load (GSAP, Three.js, React…) are pre-bundled at once instead of found while the page loads.
    config() {
      const files = [...deckScenes(deckDir).values()]
      return files.length > 0 ? { optimizeDeps: { entries: files.map(literalGlob) } } : undefined
    },
    resolveId(id: string) {
      return id === SCENES_MODULE ? RESOLVED : undefined
    },
    load(id: string) {
      if (id !== RESOLVED) return undefined
      const entries = [...deckScenes(deckDir)].map(([name, file]) => `  ${JSON.stringify(name)}: () => import(${JSON.stringify(file)}),`)
      return `export default {\n${entries.join('\n')}\n}\n`
    },
    // Remotion's modules start with "use client", which the bundler reports and ignores: nothing for the author to do.
    onLog(_level: string, log: { message?: string, id?: string }) {
      return /Module level directives/.test(log.message ?? '') && /@remotion[\\/]/.test(`${log.id ?? ''} ${log.message ?? ''}`) ? false : undefined
    },
    configureServer(server: ViteServer) {
      server.watcher.add(root)
      const changed = (file: string) => {
        if (!file.startsWith(root + sep)) return
        const module = server.moduleGraph.getModuleById(RESOLVED)
        if (module) server.moduleGraph.invalidateModule(module)
        server.ws.send({ type: 'full-reload' })
      }
      server.watcher.on('add', changed)
      server.watcher.on('unlink', changed)
    },
  }
}
