import { currentLocale, NAVIGATION, TOOLBAR } from '@presmium/host'
import { ASK, PRESENTER_PANELS } from '@presmium/kernel'
import type { PluginDefinition, Unsubscribe } from '@presmium/kernel'
import { version } from '../../package.json'
import { ASSISTANT_ID, ASSISTANT_MESSAGES } from '../domain/index.ts'
import AskPanel from './AskPanel.vue'
import AssistantToolbar from './AssistantToolbar.vue'
import { createAskClient } from './ask.ts'
import { asker, navigation, trackSelection } from './state.ts'

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
    navigation.value = ctx.tryGet(NAVIGATION)
    const ask = createAskClient(() => navigation.value, () => ASSISTANT_MESSAGES[currentLocale()].ask.missing)
    ctx.provide(ASK, ask)
    asker.value = ask
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
    asker.value = undefined
    navigation.value = undefined
  },
}

export default assistantPlugin
