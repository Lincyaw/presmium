import type { ComponentNode, IRBlock, IRPass } from '@lincyaw/kernel'
import { CLASSROOM_ID } from '../domain/index.ts'

const isPredict = (block: IRBlock): block is IRBlock & { node: ComponentNode } => block.node.type === 'component' && block.node.plugin === CLASSROOM_ID && block.node.name === 'PmPredict'
const end = (block: IRBlock) => block.at + (block.span ?? 0)

export const revealsPass: IRPass = {
  name: 'predict-reveals',
  order: -1,
  run(doc, ctx) {
    for (const section of doc.sections) {
      let last = 0
      for (let i = 0; i < section.blocks.length; i++) {
        const block = section.blocks[i]!
        last = Math.max(last, end(block))
        if (!isPredict(block)) continue
        const step = last + 1
        const revealed = section.blocks.slice(i + 1).filter(b => b.at === step)
        if (revealed.length === 0) {
          ctx.report({
            checkId: 'presmium.classroom',
            severity: 'warning',
            message: '{predict}: nothing appears at the step after it, so it reveals nothing; write what it reveals after it with :reveal:, e.g. in a {slide} with :reveal:',
            source: { file: block.source.file, line: block.source.line },
          })
          continue
        }
        section.blocks = section.blocks.filter(b => !revealed.includes(b))
        const { node } = block
        node.children = [...node.children ?? [], ...revealed]
        node.props.reveal = revealed.filter(b => b.role === 'visual').map(b => b.id)
        node.props.notes = revealed.filter(b => b.role === 'narration').map(b => b.id)
        block.span = step - block.at
        last = Math.max(last, ...revealed.map(end))
      }
    }
  },
}
