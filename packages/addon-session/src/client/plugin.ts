import { currentLocale, NAVIGATION, SYNC_TRANSPORTS, TOOLBAR } from '@presmium/host'
import { CLASSROOM_STORE, PRESENTER_PANELS, SESSION } from '@presmium/kernel'
import type { PluginDefinition, Unsubscribe } from '@presmium/kernel'
import { MESSAGES, reachableServer, SESSION_ID, sessionConfig } from '../domain/index.ts'
import { createClassroom } from './classroom.ts'
import SessionPanel from './SessionPanel.vue'
import SessionToolbar from './SessionToolbar.vue'

let cleanup: Unsubscribe[] = []

function storage(kind: 'localStorage' | 'sessionStorage'): Storage | undefined {
  try {
    return window[kind]
  } catch {
    return undefined
  }
}

/**
 * The classroom session (P-60 to P-62), registered by `setup/main.ts` in the
 * slides form and by the web renderer in the web form. Provides the `session`
 * and `classroomStore` services and shows the classroom in the hosts' toolbar
 * and presenter panels; learners follow the presenter through the hosts'
 * `navigation` service. The hosts' synchronized state (in the slides form,
 * Slidev's navigation, drawings and the stage's screen) reaches the learners
 * through the `syncTransports` service (K-06). Without
 * `presmium.session.server` the deck works as before: a published deck shows
 * no classroom, a dev server shows the session panel with how to set one up
 * (as `presmium check` tells). A server on a loopback host is reached at the
 * page's host from other devices.
 */
export const sessionPlugin: PluginDefinition = {
  manifest: {
    id: SESSION_ID,
    version: '0.1.0',
    kernel: '^0.1.0',
    provides: [SESSION, CLASSROOM_STORE],
    requires: [NAVIGATION, TOOLBAR, PRESENTER_PANELS, SYNC_TRANSPORTS].map(token => ({ token, optional: true })),
    capabilities: ['network'],
  },
  setup(ctx) {
    const { server } = sessionConfig(ctx.config)
    const classroom = createClassroom({
      server: server && reachableServer(server, location.hostname),
      navigation: ctx.tryGet(NAVIGATION),
      base: new URL(import.meta.env.BASE_URL, location.href).href,
      storage: storage('localStorage'),
      tabStorage: storage('sessionStorage'),
    })
    ctx.provide(SESSION, classroom.session)
    ctx.provide(CLASSROOM_STORE, classroom.store)
    const title = MESSAGES[currentLocale()].classroom
    const shown = server !== undefined || import.meta.env.DEV
    cleanup = [
      classroom.dispose,
      ctx.tryGet(SYNC_TRANSPORTS)?.add(classroom.transport),
      shown ? ctx.tryGet(TOOLBAR)?.register({ id: SESSION_ID, title, component: SessionToolbar }) : undefined,
      shown ? ctx.tryGet(PRESENTER_PANELS)?.register({ id: SESSION_ID, title, component: SessionPanel, order: 10 }) : undefined,
    ].filter(stop => stop !== undefined)
    void classroom.resume(location.search)
  },
  dispose() {
    cleanup.forEach(stop => stop())
    cleanup = []
  },
}

export default sessionPlugin
