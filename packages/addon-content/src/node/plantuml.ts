import { deckLocale, docBlocks } from '@lincyaw/kernel'
import type { IRPass } from '@lincyaw/kernel'
import plantuml from 'plantuml-encoder'
import { MESSAGES } from '../domain/index.ts'

const DEFAULT_SERVER = 'https://www.plantuml.com/plantuml'

export const plantUmlPass: IRPass = {
  name: 'presmium.content.plantuml',
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
