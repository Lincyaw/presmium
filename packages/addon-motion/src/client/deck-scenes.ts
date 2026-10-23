import scenes from 'virtual:presmium-motion/scenes'
import type { SceneDefinition } from './scene.ts'

function isScene(value: unknown): value is SceneDefinition {
  return typeof value === 'object' && value !== null && typeof (value as SceneDefinition).create === 'function'
}

let preloading = false

/** Starts loading every scene of the deck while the page is idle, so a scene the presenter goes to is drawn at once. */
export function preloadScenes(): void {
  if (preloading || typeof window === 'undefined') return
  preloading = true
  const idle = window.requestIdleCallback ?? ((run: () => void) => setTimeout(run, 200))
  idle(() => {
    for (const load of Object.values(scenes)) void load().catch(() => undefined)
  })
}

/** The scene `name` of the deck's `scenes/`; undefined when there is no such file. */
export async function loadScene(name: string): Promise<SceneDefinition | undefined> {
  const load = scenes[name]
  if (!load) return undefined
  const { default: scene } = await load()
  if (!isScene(scene)) throw new Error(`scenes/${name} has no scene as its default export, e.g. export default gsapScene(...)`)
  return scene
}
