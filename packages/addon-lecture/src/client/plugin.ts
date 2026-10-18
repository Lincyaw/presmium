import { currentLocale, OPERATIONS, TOOLBAR } from '@presmium/host'
import type { PluginDefinition, Unsubscribe } from '@presmium/kernel'
import { version } from '../../package.json'
import { LECTURE_ID, LECTURE_MESSAGES } from '../domain/index.ts'
import { dockWriteback } from './dock.ts'
import { applyInk, applyPoint, clearInks, clearPointer } from './marks.ts'
import { offerLectures } from './state.ts'
import WritebackPanel from './WritebackPanel.vue'

let unregister: Unsubscribe[] = []

const plugin: PluginDefinition = {
  manifest: { id: LECTURE_ID, version, kernel: '^1.0.0', requires: [{ token: OPERATIONS, optional: true }, { token: TOOLBAR, optional: true }] },
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
