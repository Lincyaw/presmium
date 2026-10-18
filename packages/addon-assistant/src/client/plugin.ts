import { currentLocale, NAVIGATION, TOOLBAR, useServer } from '@presmium/host'
import { AGENT, ASK, PRESENTER_PANELS } from '@presmium/kernel'
import type { AgentClient, PluginDefinition, Unsubscribe } from '@presmium/kernel'
import { version } from '../../package.json'
import { ASSISTANT_ID, ASSISTANT_MESSAGES } from '../domain/index.ts'
import AskPanel from './AskPanel.vue'
import AssistantToolbar from './AssistantToolbar.vue'
import EditPanel from './EditPanel.vue'
import ModelStatus from './ModelStatus.vue'
import { createAgentClient } from './agent.ts'
import { createAskClient } from './ask.ts'
import { dockPanel } from './dock.ts'
import { CLIENT_MESSAGES } from './messages.ts'
import { agent, asker, assistant as assistantClient, navigation, trackSelection } from './state.ts'

let cleanup: Unsubscribe[] = []

const unavailable: AgentClient = {
  available: () => false,
  provider: () => undefined,
  runtime: () => undefined,
  submit(request) {
    const message = ASSISTANT_MESSAGES[currentLocale()].noRuntime
    return {
      id: `${request.kind}-unavailable`,
      events: (async function* () {
        yield { type: 'error' as const, message }
      })(),
      cancel() {},
      review: async () => {
        throw new Error(message)
      },
      revert: async () => {
        throw new Error(message)
      },
    }
  },
}

export const assistantPlugin: PluginDefinition = {
  manifest: {
    id: ASSISTANT_ID,
    version,
    kernel: '^1.0.0',
    provides: [AGENT, ASK],
    requires: [{ token: TOOLBAR, optional: true }, { token: PRESENTER_PANELS, optional: true }, { token: NAVIGATION, optional: true }],
  },
  setup(ctx) {
    navigation.value = ctx.tryGet(NAVIGATION)
    const ask = createAskClient(() => navigation.value, () => ASSISTANT_MESSAGES[currentLocale()].ask.missing)
    ctx.provide(ASK, ask)
    asker.value = ask
    const server = useServer()
    if (server.available) {
      const client = createAgentClient(server)
      ctx.provide(AGENT, client.client)
      agent.value = client.client
      assistantClient.value = client
      void client.refresh()
    } else {
      ctx.provide(AGENT, unavailable)
    }
    const t = ASSISTANT_MESSAGES[currentLocale()]
    const toolbar = ctx.tryGet(TOOLBAR)
    const served = server.available ? toolbar : undefined
    cleanup = [
      toolbar?.register({ id: ASSISTANT_ID, title: t.toolbar.title, component: AssistantToolbar, order: 15 }),
      served?.register({ id: `${ASSISTANT_ID}.edit`, title: t.edit.toggle, component: EditPanel, order: 16 }),
      served?.register({ id: `${ASSISTANT_ID}.model`, title: CLIENT_MESSAGES[currentLocale()].status.title, component: ModelStatus, slot: 'status', order: 20 }),
      served && dockPanel(served, t.edit.title),
      ctx.tryGet(PRESENTER_PANELS)?.register({ id: ASSISTANT_ID, title: t.panel.title, component: AskPanel, order: 15 }),
      typeof document === 'undefined' ? undefined : trackSelection(),
    ].filter(stop => stop !== undefined)
  },
  dispose() {
    cleanup.forEach(stop => stop())
    cleanup = []
    agent.value = undefined
    asker.value = undefined
    assistantClient.value = undefined
    navigation.value = undefined
  },
}

export default assistantPlugin
