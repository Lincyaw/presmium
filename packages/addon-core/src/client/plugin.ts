import type { PluginDefinition } from '@lincyaw/kernel'
import { wantsDemo } from '../domain/index.ts'
import { demoPlugins } from './demo.ts'

export function presmiumPlugins(config: Record<string, unknown>): PluginDefinition[] {
  return wantsDemo(config) ? demoPlugins : []
}
