// The browser part: an item in each place of the shell no Presmium plugin fills in this workspace (docs/architecture.md
// 5.10): edit mode's dock (tabs, a segmented control and a menu) and the status bar, drawn with the host's components
// as a plugin's would be (the source pane is the workspace's editor). And a stand-in of the assistant's client
// (`AGENT`) that may draft, so the home page shows the agent's draft card. A kernel plugin as a plain object.
// @ts-ignore: @presmium/host and vue resolve where the test serves the workspace, not from the repository's type check.
import { PmMenu, PmSegmented, PmTabs } from '@presmium/host'
// @ts-ignore: as above.
import { h, ref } from 'vue'

interface Toolbar { register(item: Record<string, unknown>): () => void }
interface Context {
  tryGet(token: { id: string }): unknown
  provide(token: { id: string }, impl: unknown): void
}

const TOOLBAR = { id: 'presmium.toolbar' }
const AGENT = { id: 'presmium.agent' }

const Dock = {
  name: 'FixturePane-dock',
  setup() {
    const tab = ref('chat')
    const view = ref('document')
    const chosen = ref('')
    return () => h('div', { 'class': 'fixture-pane', 'data-slot': 'dock', 'role': 'region', 'aria-label': 'fixture dock' }, [
      h('p', 'fixture dock'),
      h(PmTabs, {
        'label': 'AI 修改',
        'modelValue': tab.value,
        'tabs': [{ value: 'chat', label: '对话' }, { value: 'diff', label: '差异' }, { value: 'log', label: '记录' }],
        'onUpdate:modelValue': (value: string) => tab.value = value,
      }, { default: ({ value }: { value: string }) => h('p', { class: 'fixture-tab' }, `fixture ${value}`) }),
      h(PmSegmented, {
        'label': '面板视图',
        'modelValue': view.value,
        'options': [{ value: 'document', label: '文档' }, { value: 'present', label: '放映' }],
        'onUpdate:modelValue': (value: string) => view.value = value,
      }),
      h(PmMenu, {
        label: '面板操作',
        items: [{ id: 'format', label: '格式化' }, { id: 'wrap', label: '自动换行' }, { id: 'close', label: '关闭面板', danger: true }],
        onSelect: (id: string) => chosen.value = id,
      }),
      h('output', { class: 'fixture-chosen' }, chosen.value),
    ])
  },
}

const Status = { name: 'FixturePane-status', setup: () => () => h('div', { 'class': 'fixture-pane', 'data-slot': 'status' }, 'fixture status') }

/** The assistant's client as far as the home page asks: it may chat (draft), with a provider of its own name. */
const agent = {
  available: (kind: string) => kind === 'chat',
  provider: () => '本地替身',
  runtime: () => undefined,
  submit: () => ({
    id: 'fixture',
    events: (async function* () {
      yield { type: 'error', message: '替身不起草' }
    })(),
    cancel() {},
    review: async () => {},
    revert: async () => ({ ok: false, conflicts: [] }),
  }),
}

let unregister: (() => void)[] = []

export const fixtureDesign = {
  manifest: { id: 'fixture.design', version: '0.1.0', kernel: '^1.0.0', provides: [AGENT], requires: [{ token: TOOLBAR, optional: true }] },
  setup(ctx: Context) {
    ctx.provide(AGENT, agent)
    const toolbar = ctx.tryGet(TOOLBAR) as Toolbar | undefined
    unregister = ([['dock', Dock], ['status', Status]] as const)
      .map(([slot, component]) => toolbar?.register({ id: `fixture.design.${slot}`, title: slot, component, slot }) ?? (() => {}))
  },
  dispose() {
    unregister.forEach(off => off())
    unregister = []
  },
}
