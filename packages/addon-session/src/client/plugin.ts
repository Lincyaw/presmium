import { currentLocale, NAVIGATION, SYNC_TRANSPORTS, TOOLBAR, useServer } from '@presmium/host'
import { CLASSROOM_STORE, isRecord, PRESENTER_PANELS, SESSION } from '@presmium/kernel'
import type { PluginDefinition, Unsubscribe } from '@presmium/kernel'
import { watch } from 'vue'
import { localServer, MESSAGES, reachableServer, SESSION_ID, sessionConfig } from '../domain/index.ts'
import type { LocalClassroom } from '../domain/index.ts'
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

/** How long a page waits for its host to give the server's client. */
const SERVER_WAIT_MS = 5000

/**
 * The classroom sync of the server that serves the page (`presmium dev`,
 * `presmium serve`): its WebSocket URL at the page's host and the document
 * the page names there; undefined in static output.
 */
async function ownServer(): Promise<{ server: string, params: Record<string, string> } | undefined> {
  const client = useServer()
  // The host gives its client as early as it can, which may be after the plugins are set up.
  const available = client.available || await new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => done(false), SERVER_WAIT_MS)
    const stop = watch(() => client.available, ready => ready && done(true))
    function done(ready: boolean) {
      clearTimeout(timer)
      stop()
      resolve(ready)
    }
  })
  if (!available) return undefined
  const response = await client.fetch(SESSION_ID, 'classroom').catch(() => undefined)
  const answer: unknown = response?.ok ? await response.json().catch(() => undefined) : undefined
  if (!isRecord(answer) || typeof answer.path !== 'string' || typeof answer.document !== 'string') return undefined
  return localServer(answer as unknown as LocalClassroom, location)
}

/**
 * The classroom session (P-60 to P-62), registered by `setup/main.ts` in the
 * slides form and by the web renderer in the web form. Provides the `session`
 * and `classroomStore` services and shows the classroom in the hosts' toolbar
 * and presenter panels; learners follow the presenter through the hosts'
 * `navigation` service. The hosts' synchronized state (in the slides form,
 * Slidev's navigation, drawings and the stage's screen) reaches the learners
 * through the `syncTransports` service (K-06). The classroom server is the
 * deck's `presmium.session.server` (one on a loopback host is reached at the
 * page's host from other devices); without it, the server that serves the
 * page (`presmium dev`, `presmium serve`) syncs the classroom on its own
 * port; a published deck without it shows no classroom.
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
    let disposed = false
    const show = () => [
      ctx.tryGet(TOOLBAR)?.register({ id: SESSION_ID, title, component: SessionToolbar }),
      ctx.tryGet(PRESENTER_PANELS)?.register({ id: SESSION_ID, title, component: SessionPanel, order: 10 }),
    ]
    cleanup = [classroom.dispose, ctx.tryGet(SYNC_TRANSPORTS)?.add(classroom.transport)].filter(stop => stop !== undefined)
    if (server !== undefined) {
      cleanup.push(...show().filter(stop => stop !== undefined))
      void classroom.resume(location.search)
      return
    }
    // A dev server without its own sync shows the session panel with how to set one up.
    void ownServer().then((own) => {
      if (disposed) return
      if (own) classroom.serve(own.server, own.params)
      if (own || import.meta.env.DEV) cleanup.push(...show().filter(stop => stop !== undefined))
      return classroom.resume(location.search)
    })
    cleanup.push(() => {
      disposed = true
    })
  },
  dispose() {
    cleanup.forEach(stop => stop())
    cleanup = []
  },
}

export default sessionPlugin
