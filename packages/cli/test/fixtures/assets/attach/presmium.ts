// {attach}: a component whose nested prop `files.a` names a local file (`assets` by property path,
// docs/ir.md 2.14); its slides and notebook extensions link to the prop as the renderer set it.
interface Node { props: { files: { a: string, b: string } } }

const link = (node: Node) => `<a class="fixture-attach" href="${node.props.files.a}">a</a> ${node.props.files.b}`

export default {
  id: 'fixture.attach',
  version: '0.1.0',
  kernel: '^1.0.0',
  directives: [{
    name: 'attach',
    toIR: () => ({
      node: {
        type: 'component',
        plugin: 'fixture.attach',
        name: 'FixtureAttach',
        props: { files: { a: 'data/a.txt', b: 'kept' } },
        assets: { 'files.a': 'data/a.txt' },
        fallback: { type: 'root', children: [{ type: 'paragraph', children: [{ type: 'text', value: '附件' }] }] },
      },
    }),
  }],
  rendererExtensions: {
    slides: { components: { FixtureAttach: link } },
    notebook: { components: { FixtureAttach: (node: Node) => ({ cell_type: 'markdown', source: `[a](${node.props.files.a}) ${node.props.files.b}` }) } },
  },
}
