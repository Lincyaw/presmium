// Test-only plugin that leaves malformed mdast in the IR, a node without a type: its pass does, in
// the first block of the deck, and so does its directive {typeless}, in its own block.
import type { PresmiumNodePlugin } from '@lincyaw/kernel'

const plugin: PresmiumNodePlugin = {
  id: 'fixture.breaker',
  directives: [{
    name: 'typeless',
    toIR: () => ({ node: { type: 'markdown', mdast: { type: 'root', children: [{ value: 'no type' } as never] } } }),
  }],
  passes: [{
    name: 'fixture.breaker.typeless',
    run(doc) {
      const node = doc.sections[0]!.blocks[0]!.node
      if (node.type === 'markdown') node.mdast.children!.push({ value: 'no type' } as never)
    },
  }],
}

export default plugin
