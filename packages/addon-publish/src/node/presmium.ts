import { createRequire } from 'node:module'
import type { PresmiumNodePlugin } from '@presmium/kernel'
import { PUBLISH_ID } from '../domain/index.ts'
import { remoteAssetsPass } from './assets.ts'

const { version } = createRequire(import.meta.url)('../../package.json') as { version: string }

/**
 * Publishing. Its pass downloads the remote images of the IR for offline use
 * (P-51); its tools `presmium-export` and `presmium-diff` work on the Slidev
 * deck that the slides renderer writes, and `presmium-diff` on the web
 * form's build too (P-50, P-53).
 */
const plugin: PresmiumNodePlugin = {
  id: PUBLISH_ID,
  version,
  kernel: '^0.1.0',
  passes: [remoteAssetsPass],
  rendererExtensions: {
    // The high-contrast switch is a control of the page; a notebook has nothing to switch.
    notebook: { components: { PmContrastToggle: () => [] } },
  },
}

export default plugin
