// Test-only components, one per way the notebook renders a component:
// {quiz} through this plugin's notebook extension, {chart} through its fallback,
// {canvas} with neither, so it ends up in the build report.
import type { PresmiumNodePlugin } from '@presmium/kernel'

const component = (name: string, props: Record<string, unknown> = {}) => ({ type: 'component' as const, plugin: 'fixture.widgets', name, props })

const plugin: PresmiumNodePlugin = {
  id: 'fixture.widgets',
  directives: [
    { name: 'quiz', arg: true, toIR: input => ({ node: component('FixtureQuiz', { question: input.arg }) }) },
    { name: 'chart', body: true, toIR: (input, ctx) => ({ node: { ...component('FixtureChart'), fallback: ctx.parse(input.body) } }) },
    { name: 'canvas', toIR: () => ({ node: component('FixtureCanvas') }) },
  ],
  rendererExtensions: {
    notebook: {
      components: {
        FixtureQuiz: node => [
          `**测验**：${String(node.props.question)}`,
          { cell_type: 'code', source: 'answer = None  # 在这里作答' },
        ],
      },
    },
  },
}

export default plugin
