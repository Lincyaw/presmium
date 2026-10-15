import { NAVIGATION, TOOLBAR } from '@presmium/host'
import { CLASSROOM_STORE, PRESENTER_PANELS, SESSION } from '@presmium/kernel'
import type { PluginDefinition, Unsubscribe } from '@presmium/kernel'
import { SESSION_ID, sessionConfig } from '../domain/index.ts'
import { createClassroom } from './classroom.ts'
import SessionPanel from './SessionPanel.vue'
import SessionToolbar from './SessionToolbar.vue'

let cleanup: Unsubscribe[] = []

function tabStorage(): Storage | undefined {
  try {
    return window.sessionStorage
  } catch {
    return undefined
  }
}

/**
 * The classroom session (P-60 to P-62), registered by `setup/main.ts` in the
 * slides form and by the web renderer in the web form. Provides the `session`
 * and `classroomStore` services and shows the classroom in the hosts' toolbar
 * and presenter panels; learners follow the presenter through the hosts'
 * `navigation` service. (The slides form also shares Slidev's state: see
 * `./sync.ts`.) Without `presmium.session.server` the deck works as before
 * and the session shows that it is not connected.
 */
export const sessionPlugin: PluginDefinition = {
  manifest: {
    id: SESSION_ID,
    version: '0.1.0',
    kernel: '^0.1.0',
    provides: [SESSION, CLASSROOM_STORE],
    requires: [NAVIGATION, TOOLBAR, PRESENTER_PANELS].map(token => ({ token, optional: true })),
    capabilities: ['network'],
  },
  setup(ctx) {
    const classroom = createClassroom({
      server: sessionConfig(ctx.config).server,
      navigation: ctx.tryGet(NAVIGATION),
      base: new URL(import.meta.env.BASE_URL, location.href).href,
      storage: tabStorage(),
    })
    ctx.provide(SESSION, classroom.session)
    ctx.provide(CLASSROOM_STORE, classroom.store)
    cleanup = [
      classroom.dispose,
      ctx.tryGet(TOOLBAR)?.register({ id: SESSION_ID, title: '课堂', component: SessionToolbar }),
      ctx.tryGet(PRESENTER_PANELS)?.register({ id: SESSION_ID, title: '课堂', component: SessionPanel, order: 10 }),
    ].filter(stop => stop !== undefined)
    void classroom.resume(location.search)
  },
  dispose() {
    cleanup.forEach(stop => stop())
    cleanup = []
  },
}

export default sessionPlugin
