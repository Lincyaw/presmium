import type { PluginDefinition } from '@presmium/kernel'
import { version } from '../../package.json'
import { CONTENT_ID } from '../domain/index.ts'
import { defineDemoElements } from './elements.ts'

/**
 * The rich content plugin. Registered by setup/main.ts in the slides form and
 * by @presmium/web in the document form; starting it defines the demo web component.
 */
const plugin: PluginDefinition = {
  manifest: { id: CONTENT_ID, version, kernel: '^1.0.0' },
  setup() {
    defineDemoElements()
  },
}

export default plugin
