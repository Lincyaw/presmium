import { currentLocale, TOOLBAR } from '@presmium/host'
import type { PluginDefinition, Unsubscribe } from '@presmium/kernel'
import { defineComponent, h } from 'vue'
import PmContrastToggle from '../../components/PmContrastToggle.vue'
import { MESSAGES, PUBLISH_ID } from '../domain/index.ts'
import { initHighContrast } from './contrast.ts'
import './contrast.css'

/** The switch as the hosts' toolbars show it: the icon only. */
const ToolbarToggle = defineComponent(() => () => h(PmContrastToggle, { compact: true }))

let unregister: Unsubscribe | undefined

/**
 * Client plugin of the publishing context, registered by `setup/main.ts` in the
 * slides form and by the web package in the document form. Importing it also
 * brings in the high-contrast CSS variables. The high-contrast switch goes into
 * the host's toolbar, so every page of both forms has it (P-52).
 */
export const publishPlugin: PluginDefinition = {
  manifest: { id: PUBLISH_ID, version: '0.1.0', kernel: '^0.1.0', requires: [{ token: TOOLBAR, optional: true }] },
  setup(ctx) {
    initHighContrast()
    unregister = ctx.tryGet(TOOLBAR)?.register({ id: PUBLISH_ID, title: MESSAGES[currentLocale()].highContrast, component: ToolbarToggle, order: 20 })
  },
  dispose() {
    unregister?.()
    unregister = undefined
  },
}

export default publishPlugin
