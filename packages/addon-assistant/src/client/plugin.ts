import { currentLocale, NAVIGATION, TOOLBAR } from '@lincyaw/host'
import { ASK, PRESENTER_PANELS } from '@lincyaw/kernel'
import type { PluginDefinition, Unsubscribe } from '@lincyaw/kernel'
import { version } from '../../package.json'
import { ASSISTANT_ID, ASSISTANT_MESSAGES } from '../domain/index.ts'
import AskPanel from './AskPanel.vue'
import AssistantToolbar from './AssistantToolbar.vue'
import { createAskClient } from './chat-client.ts'
import { askClient, keptWebViewerAccess, slideNavigation, trackSelection } from './state.ts'

let cleanup: Unsubscribe[] = []

export const assistantPlugin: PluginDefinition = {
  manifest: {
    id: ASSISTANT_ID,
    version,
    kernel: '^1.0.0',
    provides: [ASK],
    requires: [{ token: TOOLBAR, optional: true }, { token: PRESENTER_PANELS, optional: true }, { token: NAVIGATION, optional: true }],
  },
  setup(ctx) {
    slideNavigation.value = ctx.tryGet(NAVIGATION)
    const ask = createAskClient({
      webViewer: keptWebViewerAccess,
      slideNavigation: () => slideNavigation.value,
      missing: () => ASSISTANT_MESSAGES[currentLocale()].ask.missing,
    })
    ctx.provide(ASK, ask)
    askClient.value = ask
    const t = ASSISTANT_MESSAGES[currentLocale()]
    cleanup = [
      ctx.tryGet(TOOLBAR)?.register({ id: ASSISTANT_ID, title: t.toolbar.title, component: AssistantToolbar, order: 15 }),
      ctx.tryGet(PRESENTER_PANELS)?.register({ id: ASSISTANT_ID, title: t.panel.title, component: AskPanel, order: 15 }),
      typeof document === 'undefined' ? undefined : trackSelection(),
    ].filter(stop => stop !== undefined)
  },
  dispose() {
    cleanup.forEach(stop => stop())
    cleanup = []
    askClient.value = undefined
    slideNavigation.value = undefined
  },
}

export default assistantPlugin
