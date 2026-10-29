import { currentLocale, NAVIGATION, TOOLBAR } from '@lincyaw/host'
import { ASK, PRESENTER_PANELS } from '@lincyaw/kernel'
import type { PluginDefinition, Unsubscribe } from '@lincyaw/kernel'
import { version } from '../../package.json'
import { ASSISTANT_ID, ASSISTANT_MESSAGES } from '../domain/index.ts'
import AskPanel from './AskPanel.tsx'
import AssistantToolbar from './AssistantToolbar.tsx'
import { createAskClient } from './chat-client.ts'
import { askClient, keptWebViewerAccess, slideNavigation, trackSelection } from './state.ts'

let cleanup: Unsubscribe[] = []

export const assistantPlugin: PluginDefinition = {
  manifest: {
    id: ASSISTANT_ID,
    name: { 'zh-CN': '读者问答', en: 'Reader Q&A' },
    version,
    kernel: '^1.0.0',
    provides: [ASK],
    requires: [{ token: TOOLBAR, optional: true }, { token: PRESENTER_PANELS, optional: true }, { token: NAVIGATION, optional: true }],
  },
  setup(ctx) {
    const lifetime = new AbortController()
    slideNavigation.set(ctx.tryGet(NAVIGATION))
    const ask = createAskClient({
      webViewer: keptWebViewerAccess,
      slideNavigation: () => slideNavigation.getSnapshot(),
      missing: () => ASSISTANT_MESSAGES[currentLocale()].ask.missing,
      signal: lifetime.signal,
    })
    ctx.provide(ASK, ask)
    askClient.set(ask)
    const t = ASSISTANT_MESSAGES[currentLocale()]
    cleanup = [
      () => lifetime.abort(),
      ctx.tryGet(TOOLBAR)?.register({ id: ASSISTANT_ID, title: t.toolbar.title, component: AssistantToolbar, order: 15 }),
      ctx.tryGet(PRESENTER_PANELS)?.register({ id: ASSISTANT_ID, title: t.panel.title, component: AskPanel, order: 15 }),
      typeof document === 'undefined' ? undefined : trackSelection(),
    ].filter(stop => stop !== undefined)
  },
  dispose() {
    cleanup.forEach(stop => stop())
    cleanup = []
    askClient.set(undefined)
    slideNavigation.set(undefined)
  },
}

export default assistantPlugin
