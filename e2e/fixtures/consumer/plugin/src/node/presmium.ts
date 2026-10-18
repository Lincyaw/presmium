// A plugin written outside Presmium, installed from its tarball (P-141): `{hello} <name>` becomes its
// component, which both forms show; the notebook shows the fallback. Its Vite plugin has both forms'
// frameworks import this file, TypeScript under node_modules.
import type { DirectiveSpec, PresmiumNodePlugin } from '@presmium/kernel'

const hello: DirectiveSpec = {
  name: 'hello',
  arg: true,
  toIR(input) {
    const name = input.arg?.trim() || 'world'
    return {
      node: {
        type: 'component',
        plugin: 'acme.hello',
        name: 'HelloGreeting',
        props: { name },
        fallback: { type: 'root', children: [{ type: 'paragraph', children: [{ type: 'text', value: `Hello, ${name}! (fallback)` }] }] },
      },
    }
  },
}

const plugin: PresmiumNodePlugin = {
  id: 'acme.hello',
  version: '1.0.0',
  kernel: '^0.1.0',
  directives: [hello],
  vitePlugins: () => [{ name: 'acme:hello' }],
}

export default plugin
