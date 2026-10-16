import { deckLocale, docBlocks } from '@presmium/kernel'
import type { IRPass } from '@presmium/kernel'
import plantuml from 'plantuml-encoder'
import { MESSAGES } from '../domain/index.ts'

/** PlantUML server that draws the diagrams, as Slidev's `plantUmlServer` defaults to. */
const DEFAULT_SERVER = 'https://www.plantuml.com/plantuml'

/**
 * ```plantuml code blocks become images of the diagram (P-41), drawn as SVG
 * by the PlantUML server (`presmium.content.plantUmlServer`). Every renderer
 * shows an image, and the publish plugin can download it for offline use.
 */
export const plantUmlPass: IRPass = {
  name: 'plantuml',
  run(doc, ctx) {
    const server = (typeof ctx.config.plantUmlServer === 'string' ? ctx.config.plantUmlServer : DEFAULT_SERVER).replace(/\/+$/, '')
    const alt = MESSAGES[deckLocale(ctx.lang)].plantUml
    for (const { block } of docBlocks(doc)) {
      const { node } = block
      if (node.type !== 'code' || !/^(?:plantuml|puml)$/i.test(node.lang)) continue
      const image = { type: 'image', url: `${server}/svg/${plantuml.encode(node.value)}`, alt: node.title ?? alt }
      block.node = { type: 'markdown', mdast: { type: 'root', children: [{ type: 'paragraph', children: [image] }] } }
    }
  },
}
