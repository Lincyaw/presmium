import type { PluginDefinition } from '@presmium/kernel'
import { version } from '../../package.json'
import { CONTENT_ID } from '../domain/index.ts'
import { defineDemoElements } from './elements.ts'

const plugin: PluginDefinition = {
  manifest: { id: CONTENT_ID, version, kernel: '^1.0.0' },
  setup() {
    defineDemoElements()
  },
}

export default plugin
