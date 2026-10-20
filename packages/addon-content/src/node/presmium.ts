import { createRequire } from 'node:module'
import type { PresmiumNodePlugin } from '@lincyaw/kernel'
import { CONTENT_ID, MEDIA_KINDS } from '../domain/index.ts'
import { markmapDirective } from './markmap.ts'
import { mediaDirective, notebookMedia, youtubeDirective } from './media.ts'
import { plantUmlPass } from './plantuml.ts'

const { version } = createRequire(import.meta.url)('../../package.json') as { version: string }

const plugin: PresmiumNodePlugin = {
  id: CONTENT_ID,
  version,
  kernel: '^1.0.0',
  directives: [markmapDirective, ...MEDIA_KINDS.map(kind => mediaDirective(kind)), youtubeDirective],
  passes: [plantUmlPass],
  rendererExtensions: { notebook: { components: { PmMedia: notebookMedia } } },
}

export default plugin
