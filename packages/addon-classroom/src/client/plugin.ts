import { currentLocale, TOOLBAR } from '@presmium/host'
import { CLASSROOM_STORE, EXECUTOR, PRESENTER_PANELS, SESSION } from '@presmium/kernel'
import type { PluginDefinition, Unsubscribe } from '@presmium/kernel'
import { CLASSROOM_ID, MESSAGES } from '../domain/index.ts'
import ClassroomPanel from './ClassroomPanel.vue'
import ClassroomToolbar from './ClassroomToolbar.vue'

let cleanup: Unsubscribe[] = []

/**
 * Classroom features (P-63 to P-67), registered by `setup/main.ts` in the
 * slides form and by the web renderer in the web form. The components
 * (`components/`) work over the `session` and `classroomStore` services and
 * check exercises with the `executor` service; without a session they work
 * alone (self-test quizzes, exercises, notes in the browser). The plugin adds
 * the presenter's overview to the presenter panels and the toolbar, and the
 * notes beside the sections of the web form.
 */
export const classroomPlugin: PluginDefinition = {
  manifest: {
    id: CLASSROOM_ID,
    version: '0.1.0',
    kernel: '^0.1.0',
    requires: [SESSION, CLASSROOM_STORE, EXECUTOR, TOOLBAR, PRESENTER_PANELS].map(token => ({ token, optional: true })),
  },
  setup(ctx) {
    const title = MESSAGES[currentLocale()].interaction
    cleanup = [
      ctx.tryGet(TOOLBAR)?.register({ id: CLASSROOM_ID, title, component: ClassroomToolbar, order: 20 }),
      ctx.tryGet(PRESENTER_PANELS)?.register({ id: CLASSROOM_ID, title, component: ClassroomPanel, order: 20 }),
    ].filter(stop => stop !== undefined)
  },
  dispose() {
    cleanup.forEach(stop => stop())
    cleanup = []
  },
}

export default classroomPlugin
