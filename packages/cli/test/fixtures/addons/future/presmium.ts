// Test-only plugin written for a kernel that does not exist yet: the compiler must not load it.
import type { PresmiumNodePlugin } from '@presmium/kernel'

const plugin: PresmiumNodePlugin = {
  id: 'fixture.future',
  version: '2.0.0',
  kernel: '^9.0.0',
  directives: [{
    name: 'future',
    toIR: () => ({ node: { type: 'markdown', mdast: { type: 'root', children: [] } } }),
  }],
}

export default plugin
