/**
 * The assistant in the page (P-111 to P-114; docs/architecture.md 4.8),
 * registered by `setup/main.ts` in the slides form and by the web renderer
 * in the web form. Every page has the question panel, in the toolbar and in
 * the presenter panels, and `ASK`, the reader's own model service, which it
 * asks from the browser (P-112, ./ask.ts): static output too. Where
 * `presmium dev` or `presmium serve` serves the page it also provides
 * `AGENT` (the client of the server's assistant, ./agent.ts) and adds "AI
 * changes" to the toolbar (./EditPanel.vue): in the workspace's edit mode
 * the switch of the panel of annotations and chat, docked at the right of
 * the split (./EditDock.vue, ./dock.ts), elsewhere what is needed for it, and
 * the model settings; the model and where it comes from in the status bars
 * (./ModelStatus.vue). Static output has no server: there `AGENT` is a
 * client that is never available (F-48). The text the reader selects in the
 * deck goes with a question or a chat message.
 */
import { currentLocale, NAVIGATION, TOOLBAR, useServer } from '@presmium/host'
import { AGENT, ASK, PRESENTER_PANELS } from '@presmium/kernel'
import type { AgentClient, PluginDefinition, Unsubscribe } from '@presmium/kernel'
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

/** `AGENT` where no server serves the page (static output): no kind is available, a task ends at once with why. */
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
    version: '0.1.0',
    kernel: '^0.1.0',
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
      // Declared, so provided: its users see an assistant that is not there.
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
