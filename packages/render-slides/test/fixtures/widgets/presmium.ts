// Test-only plugin: components as the slides and notebook renderers meet them.
// {boom}: a component whose slides extension throws; {clip}: a component that names a local
// file (`assets`); {panel}: a component that holds code run at build time; FixtureTwin: a
// component named as one of the twin plugin, whose extensions must not be picked for its nodes;
// {pointer}: an overlay with nothing to show in exports.
import type { ComponentNode, PresmiumNodePlugin } from '@presmium/kernel'

const ID = 'fixture.widgets'
const component = (name: string, extra: Partial<ComponentNode> = {}): ComponentNode => ({ type: 'component', plugin: ID, name, props: {}, ...extra })

const plugin: PresmiumNodePlugin = {
  id: ID,
  directives: [
    { name: 'boom', toIR: () => ({ node: component('FixtureBoom', { fallback: { type: 'root', children: [{ type: 'paragraph', children: [{ type: 'text', value: 'boom fallback' }] }] } }) }) },
    { name: 'pointer', toIR: () => ({ node: component('FixturePointer', { layer: 'overlay', fallback: { type: 'root', children: [] } }) }) },
    { name: 'clip', arg: true, toIR: ({ arg = '' }) => ({ node: component('FixtureClip', { props: { src: arg }, assets: { src: arg } }) }) },
    {
      name: 'panel',
      toIR: (_input, ctx) => ({ node: component('FixturePanel', { children: [{
        id: 'code',
        role: 'visual',
        at: 0,
        source: ctx.source,
        node: { type: 'code', lang: 'echo', value: 'owned by the panel', run: { lang: 'echo', when: 'compile' } },
      }] }) }),
    },
  ],
  rendererExtensions: {
    slides: {
      components: {
        FixtureBoom: () => {
          throw new Error('the extension broke')
        },
        FixtureTwin: () => '<p>twin from widgets</p>',
      },
    },
    notebook: {
      components: {
        // A Markdown cell given as mdast: the renderer lowers it and copies what it links.
        FixtureClip: node => ({ cell_type: 'markdown', mdast: { type: 'root', children: [{ type: 'paragraph', children: [
          { type: 'text', value: 'Press ' },
          { type: 'keyboard', children: [{ type: 'text', value: 'Space' }] },
          { type: 'text', value: ' to play ' },
          { type: 'link', url: String(node.props.src), children: [{ type: 'text', value: 'the clip' }] },
        ] }] } }),
        FixtureTwin: () => 'twin from widgets',
      },
    },
  },
}

export default plugin
