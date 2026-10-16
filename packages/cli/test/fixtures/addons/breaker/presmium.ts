// Test-only plugin whose pass leaves malformed mdast in the IR: a node without a type.
import type { PresmiumNodePlugin } from '@presmium/kernel'

const plugin: PresmiumNodePlugin = {
  id: 'fixture.breaker',
  passes: [{
    name: 'fixture.breaker.typeless',
    run(doc) {
      const node = doc.sections[0]!.blocks[0]!.node
      if (node.type === 'markdown') node.mdast.children!.push({ value: 'no type' } as never)
    },
  }],
}

export default plugin
