import type { PluginDefinition } from '@presmium/kernel'
import { wantsDemo } from '../domain/index.ts'
import { demoPlugins } from './demo.ts'

/**
 * Kernel plugins of this package, registered from here by both hosts: the
 * slides form in `startSlidevPresmium`, the web form by @presmium/web (both
 * through `pluginsOf`). The demo plugins start only when the deck enables them.
 */
export function presmiumPlugins(config: Record<string, unknown>): PluginDefinition[] {
  return wantsDemo(config) ? demoPlugins : []
}
