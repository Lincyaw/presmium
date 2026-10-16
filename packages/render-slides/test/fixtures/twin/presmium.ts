// Test-only plugin whose component has the name of one of the widgets plugin (fixture.widgets):
// both renderers pick the extensions of the plugin the node names.
import type { PresmiumNodePlugin } from '@presmium/kernel'

const ID = 'fixture.twin'

const plugin: PresmiumNodePlugin = {
  id: ID,
  directives: [{ name: 'twin', toIR: () => ({ node: { type: 'component', plugin: ID, name: 'FixtureTwin', props: {} } }) }],
  rendererExtensions: {
    slides: { components: { FixtureTwin: () => '<p>twin from twin</p>' } },
    notebook: { components: { FixtureTwin: () => 'twin from twin' } },
  },
}

export default plugin
