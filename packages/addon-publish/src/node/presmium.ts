import { createRequire } from 'node:module'
import type { PresmiumNodePlugin } from '@lincyaw/kernel'
import { PUBLISH_ID } from '../domain/index.ts'
import { remoteAssetsPass } from './assets.ts'

const { version } = createRequire(import.meta.url)('../../package.json') as { version: string }

const plugin: PresmiumNodePlugin = {
  id: PUBLISH_ID,
  version,
  kernel: '^1.0.0',
  passes: [remoteAssetsPass],
  rendererExtensions: {
    notebook: { components: { PmContrastToggle: () => [] } },
  },
}

export default plugin
