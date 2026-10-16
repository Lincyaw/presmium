import type { ComponentNode, IRBlock, IRPass } from '@presmium/kernel'
import { CLASSROOM_ID } from '../domain/index.ts'

const isPredict = (block: IRBlock): block is IRBlock & { node: ComponentNode } => block.node.type === 'component' && block.node.plugin === CLASSROOM_ID && block.node.name === 'PmPredict'
const end = (block: IRBlock) => block.at + (block.span ?? 0)

/**
 * What `{predict}` reveals (docs/ir.md 2.13): everything the next step after
 * it brings, the blocks `:reveal:` makes appear there and the narration of
 * that step. They become the children of its `PmPredict`, after its prompt,
 * with their ids and steps, so the reader's view can hold them back until
 * the reader has predicted while a presentation shows them at their step.
 * The props `reveal` and `notes` list the ids of those shown on screen and of
 * the narration; the block's `span` reaches the step they appear at. Runs
 * before `classroom-places`, which writes the static form with them.
 */
export const revealsPass: IRPass = {
  name: 'predict-reveals',
  order: -1,
  run(doc, ctx) {
    for (const section of doc.sections) {
      // The last step used so far: the step after it is the next one the section brings.
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
