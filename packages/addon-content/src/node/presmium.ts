import { createRequire } from 'node:module'
import type { PresmiumNodePlugin } from '@presmium/kernel'
import { CONTENT_ID, MEDIA_KINDS } from '../domain/index.ts'
import { markmapDirective } from './markmap.ts'
import { mediaDirective, youtubeDirective } from './media.ts'
import { plantUmlPass } from './plantuml.ts'

const { version } = createRequire(import.meta.url)('../../package.json') as { version: string }

/**
 * Rich content (P-40 to P-43). Math and Mermaid are drawn by the renderers;
 * this plugin adds the `{markmap}` mindmap, the media directives `{video}`,
 * `{audio}`, `{animation}` and `{youtube}`, and turns ```plantuml blocks into
 * diagram images.
 */
const plugin: PresmiumNodePlugin = {
  id: CONTENT_ID,
  version,
  kernel: '^0.1.0',
  directives: [markmapDirective, ...MEDIA_KINDS.map(kind => mediaDirective(kind)), youtubeDirective],
  passes: [plantUmlPass],
}

export default plugin
