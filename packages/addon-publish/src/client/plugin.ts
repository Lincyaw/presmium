import type { PluginDefinition } from '@presmium/kernel'
import { PUBLISH_ID } from '../domain/index.ts'
import { initHighContrast } from './contrast.ts'
import './contrast.css'

/**
 * Client plugin of the publishing context, registered by `setup/main.ts` in the
 * slides form and by the web package in the document form. Importing it also
 * brings in the high-contrast CSS variables.
 */
export const publishPlugin: PluginDefinition = {
  manifest: { id: PUBLISH_ID, version: '0.1.0', kernel: '^0.1.0' },
  setup() {
    initHighContrast()
  },
}

export default publishPlugin
