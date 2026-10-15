import type { PresmiumNodePlugin } from '@presmium/kernel'
import { CONTENT_ID } from '../domain/index.ts'
import { markmapDirective } from './markmap.ts'
import { mediaDirective, slidesMedia } from './media.ts'
import { plantUmlPass } from './plantuml.ts'

/**
 * Rich content (P-40 to P-43). Math and Mermaid are drawn by the renderers;
 * this plugin adds the `{markmap}` mindmap, the media directives `{video}`,
 * `{audio}` and `{animation}`, and turns ```plantuml blocks into diagram images.
 */
const plugin: PresmiumNodePlugin = {
  id: CONTENT_ID,
  directives: [markmapDirective, mediaDirective('video'), mediaDirective('audio'), mediaDirective('animation')],
  passes: [plantUmlPass],
  rendererExtensions: {
    slides: { components: { PmMedia: slidesMedia } },
  },
}

export default plugin
