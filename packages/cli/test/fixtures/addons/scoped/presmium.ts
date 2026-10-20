// Test-only plugin `fixture.scoped`: `{badge}` shows the `label` option it is configured with
// where it is written, and its pass records the label of each section in the metadata.
import type { PresmiumNodePlugin } from '@lincyaw/kernel'

const plugin: PresmiumNodePlugin = {
  id: 'fixture.scoped',
  directives: [{
    name: 'badge',
    toIR: (_input, ctx) => ({ node: { type: 'component', plugin: 'fixture.scoped', name: 'FixtureBadge', props: { label: ctx.config.label, tone: ctx.config.tone } } }),
  }],
  passes: [{
    name: 'fixture.scoped.labels',
    run(doc, ctx) {
      doc.meta.labels = Object.fromEntries(doc.sections.map(section => [section.id, ctx.configFor(section).label]))
    },
  }],
}

export default plugin
