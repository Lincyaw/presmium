// The browser part: an item in each place of the shell no Presmium plugin fills yet (docs/architecture.md 5.10):
// the source pane and the dock of edit mode, and the status bar. A kernel plugin as a plain object.
// @ts-ignore: vue resolves from examples/demo, where the test copies the workspace, not from the repository's type check.
import { h } from 'vue'

interface Toolbar { register(item: Record<string, unknown>): () => void }
interface Context { tryGet(token: { id: string }): unknown }

const TOOLBAR = { id: 'presmium.toolbar' }
const pane = (slot: string) => ({ name: `FixturePane-${slot}`, setup: () => () => h('div', { 'class': 'fixture-pane', 'data-slot': slot }, `fixture ${slot}`) })
let unregister: (() => void)[] = []

export const fixtureDesign = {
  manifest: { id: 'fixture.design', version: '0.1.0', kernel: '^0.1.0', requires: [{ token: TOOLBAR, optional: true }] },
  setup(ctx: Context) {
    const toolbar = ctx.tryGet(TOOLBAR) as Toolbar | undefined
    unregister = ['source', 'dock', 'status'].map(slot => toolbar?.register({ id: `fixture.design.${slot}`, title: slot, component: pane(slot), slot }) ?? (() => {}))
  },
  dispose() {
    unregister.forEach(off => off())
    unregister = []
  },
}
