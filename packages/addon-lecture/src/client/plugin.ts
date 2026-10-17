import { currentLocale, OPERATIONS, TOOLBAR } from '@presmium/host'
import type { PluginDefinition, Unsubscribe } from '@presmium/kernel'
import { LECTURE_ID, LECTURE_MESSAGES } from '../domain/index.ts'
import { dockWriteback } from './dock.ts'
import { applyInk, applyPoint, clearInks, clearPointer } from './marks.ts'
import { offerLectures } from './state.ts'
import WritebackPanel from './WritebackPanel.vue'

let unregister: Unsubscribe[] = []

/**
 * The lecture plugin's part of the host (docs/architecture.md 4.9): the
 * replay of what it reports while a lecture is recorded, the pointer
 * (`point`) and the laser and marker strokes (`ink`); and in the toolbar,
 * shown in the workspace's edit mode only, the switch of the panel docked
 * beside the page that hands a recorded lecture to the assistant's agent
 * (P-136, P-137; ./dock.ts). It takes the compiler's
 * word on whether the deck has lectures (`offerLectures`). The web package
 * registers it in the document form.
 */
const plugin: PluginDefinition = {
  manifest: { id: LECTURE_ID, version: '0.1.0', kernel: '^0.1.0', requires: [{ token: OPERATIONS, optional: true }, { token: TOOLBAR, optional: true }] },
  setup(ctx) {
    offerLectures(ctx.config)
    const operations = ctx.tryGet(OPERATIONS)
    const toolbar = ctx.tryGet(TOOLBAR)
    unregister = [
      ...operations
        ? [operations.onReplay('point', { apply: applyPoint, clear: clearPointer }), operations.onReplay('ink', { apply: applyInk, clear: clearInks })]
        : [],
      ...toolbar
        ? [
            toolbar.register({ id: `${LECTURE_ID}.writeback`, title: LECTURE_MESSAGES[currentLocale()].writeback.title, component: WritebackPanel, order: 17 }),
            dockWriteback(toolbar, LECTURE_MESSAGES[currentLocale()].writeback.title),
          ]
        : [],
    ]
  },
  dispose() {
    unregister.forEach(off => off())
    unregister = []
    clearPointer()
    clearInks()
  },
}

export default plugin
