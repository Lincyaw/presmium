/**
 * The assistant in the page (P-112 to P-114; docs/architecture.md 4.8),
 * registered by `setup/main.ts` in the slides form and by the web renderer
 * in the web form. Where `presmium dev` or `presmium serve` serves the page
 * it provides `AGENT` (the client of the server's assistant, ./agent.ts) and
 * adds the question panel to the toolbar and to the presenter panels, and,
 * in the workspace's edit mode, the panel of annotations and chat
 * (./EditPanel.vue); static output has none. The text the reader selects in
 * the deck goes with a question or a chat message.
 */
import { currentLocale, TOOLBAR, useServer } from '@presmium/host'
import { AGENT, PRESENTER_PANELS } from '@presmium/kernel'
import type { PluginDefinition, Unsubscribe } from '@presmium/kernel'
import { ASSISTANT_ID, ASSISTANT_MESSAGES } from '../domain/index.ts'
import AskPanel from './AskPanel.vue'
import AssistantToolbar from './AssistantToolbar.vue'
import EditPanel from './EditPanel.vue'
import { createAgentClient } from './agent.ts'
import { agent, assistant as assistantClient, trackSelection } from './state.ts'

let cleanup: Unsubscribe[] = []

export const assistantPlugin: PluginDefinition = {
  manifest: {
    id: ASSISTANT_ID,
    version: '0.1.0',
    kernel: '^0.1.0',
    provides: [AGENT],
    requires: [{ token: TOOLBAR, optional: true }, { token: PRESENTER_PANELS, optional: true }],
  },
  setup(ctx) {
    const server = useServer()
    if (!server.available) return
    const assistant = createAgentClient(server)
    ctx.provide(AGENT, assistant.client)
    agent.value = assistant.client
    assistantClient.value = assistant
    void assistant.refresh()
    const t = ASSISTANT_MESSAGES[currentLocale()]
    cleanup = [
      ctx.tryGet(TOOLBAR)?.register({ id: ASSISTANT_ID, title: t.toolbar.title, component: AssistantToolbar, order: 15 }),
      // Shown in the workspace's edit mode only (`EDIT_MODE`, which the workspace's plugin provides after this one starts).
      ctx.tryGet(TOOLBAR)?.register({ id: `${ASSISTANT_ID}.edit`, title: t.edit.title, component: EditPanel, order: 16 }),
      ctx.tryGet(PRESENTER_PANELS)?.register({ id: ASSISTANT_ID, title: t.panel.title, component: AskPanel, order: 15 }),
      typeof document === 'undefined' ? undefined : trackSelection(),
    ].filter(stop => stop !== undefined)
  },
  dispose() {
    cleanup.forEach(stop => stop())
    cleanup = []
    agent.value = undefined
    assistantClient.value = undefined
  },
}

export default assistantPlugin
