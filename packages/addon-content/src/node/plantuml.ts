import type { IRBlock, IRPass } from '@presmium/kernel'
import plantuml from 'plantuml-encoder'

/** PlantUML server that draws the diagrams, as Slidev's `plantUmlServer` defaults to. */
const DEFAULT_SERVER = 'https://www.plantuml.com/plantuml'

function each(blocks: IRBlock[], visit: (block: IRBlock) => void): void {
  for (const block of blocks) {
    visit(block)
    if (block.node.type === 'component' && block.node.children) each(block.node.children, visit)
  }
}

/**
 * ```plantuml code blocks become images of the diagram (P-41), drawn as SVG
 * by the PlantUML server (`presmium.content.plantUmlServer`). Every renderer
 * shows an image, and the publish plugin can download it for offline use.
 */
export const plantUmlPass: IRPass = {
  name: 'plantuml',
  run(doc, ctx) {
    const server = (typeof ctx.config.plantUmlServer === 'string' ? ctx.config.plantUmlServer : DEFAULT_SERVER).replace(/\/+$/, '')
    for (const section of doc.sections) {
      each(section.blocks, (block) => {
        const { node } = block
        if (node.type !== 'code' || !/^(?:plantuml|puml)$/i.test(node.lang)) return
        const image = { type: 'image', url: `${server}/svg/${plantuml.encode(node.value)}`, alt: node.title ?? 'PlantUML 图' }
        block.node = { type: 'markdown', mdast: { type: 'root', children: [{ type: 'paragraph', children: [image] }] } }
      })
    }
  },
}
