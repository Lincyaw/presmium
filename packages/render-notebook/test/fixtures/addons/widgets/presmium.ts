// Test-only components, one per way the notebook renders a component:
// {quiz} through this plugin's notebook extension, {chart} through its fallback,
// {canvas} with neither, so it ends up in the build report; {clip} names a local file
// (`assets`) and its extension gives a Markdown cell as mdast.
import type { PresmiumNodePlugin } from '@lincyaw/kernel'

const component = (name: string, props: Record<string, unknown> = {}) => ({ type: 'component' as const, plugin: 'fixture.widgets', name, props })

const plugin: PresmiumNodePlugin = {
  id: 'fixture.widgets',
  directives: [
    { name: 'quiz', arg: true, toIR: input => ({ node: component('FixtureQuiz', { question: input.arg }) }) },
    // The chart's preview image is a child the notebook does not show, as it shows the fallback.
    { name: 'chart', body: true, toIR: (input, ctx) => ({ node: { ...component('FixtureChart'), fallback: ctx.parse(input.body), children: [{
      id: 'preview',
      role: 'visual',
      at: 0,
      source: ctx.source,
      node: { type: 'markdown', mdast: { type: 'root', children: [{ type: 'paragraph', children: [{ type: 'image', url: 'figures/chart.svg', alt: '预览' }] }] } },
    }] } }) },
    { name: 'canvas', toIR: () => ({ node: component('FixtureCanvas') }) },
    { name: 'clip', arg: true, toIR: input => ({ node: { ...component('FixtureClip', { src: input.arg }), assets: { src: input.arg ?? '' } } }) },
  ],
  rendererExtensions: {
    notebook: {
      components: {
        // The renderer's context gives the extension the notebook's configuration.
        FixtureQuiz: (node, _block, ctx) => [
          `**测验**：${String(node.props.question)}（[网页版](${String(ctx.config.webUrl)})）`,
          { cell_type: 'code', source: 'answer = None  # 在这里作答' },
        ],
        FixtureClip: node => ({ cell_type: 'markdown', mdast: { type: 'root', children: [{ type: 'paragraph', children: [
          { type: 'keyboard', children: [{ type: 'text', value: 'Space' }] },
          { type: 'text', value: ' plays ' },
          { type: 'html', value: `<video src="${String(node.props.src)}"></video>` },
        ] }] } }),
      },
    },
  },
}

export default plugin
