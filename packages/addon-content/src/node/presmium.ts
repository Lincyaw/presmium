import { createRequire } from 'node:module'
import type { PresmiumNodePlugin } from '@lincyaw/kernel'
import { CONTENT_ID } from '../domain/index.ts'
import { mediaAssetsPass, notebookMedia } from './media.ts'
import { plantUmlPass } from './plantuml.ts'

const { version } = createRequire(import.meta.url)('../../package.json') as { version: string }

const plugin: PresmiumNodePlugin = {
  id: CONTENT_ID,
  version,
  kernel: '^1.0.0',
  passes: [plantUmlPass, mediaAssetsPass],
  rendererExtensions: { notebook: { components: { PmMedia: notebookMedia } } },
}

export default plugin
