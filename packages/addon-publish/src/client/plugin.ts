import { currentLocale, TOOLBAR } from '@presmium/host'
import type { PluginDefinition, Unsubscribe } from '@presmium/kernel'
import { defineComponent, h } from 'vue'
import { version } from '../../package.json'
import PmContrastToggle from '../../components/PmContrastToggle.vue'
import PmSaveOffline from '../../components/PmSaveOffline.vue'
import { MESSAGES, PUBLISH_ID } from '../domain/index.ts'
import { initHighContrast } from './contrast.ts'
import './contrast.css'

/** The switch as the hosts' toolbars show it: the icon only. */
const ToolbarToggle = defineComponent(() => () => h(PmContrastToggle, { compact: true }))

let unregister: Unsubscribe[] = []

/**
 * Client plugin of the publishing context, registered by `setup/main.ts` in the
 * slides form and by the web package in the document form. Importing it also
 * brings in the high-contrast CSS variables. The high-contrast switch goes into
 * the host's toolbar, so every page of both forms has it (P-52); so does
 * "save for offline use", which shows where the service worker offers it
 * (the web form's, D-6).
 */
export const publishPlugin: PluginDefinition = {
  manifest: { id: PUBLISH_ID, version, kernel: '^1.0.0', requires: [{ token: TOOLBAR, optional: true }] },
  setup(ctx) {
    initHighContrast()
    const toolbar = ctx.tryGet(TOOLBAR)
    const t = MESSAGES[currentLocale()]
    unregister = toolbar
      ? [
          toolbar.register({ id: PUBLISH_ID, title: t.highContrast, component: ToolbarToggle, order: 20 }),
          toolbar.register({ id: `${PUBLISH_ID}.offline`, title: t.savedOffline, component: PmSaveOffline, order: 21 }),
        ]
      : []
  },
  dispose() {
    unregister.forEach(off => off())
    unregister = []
  },
}

export default publishPlugin
