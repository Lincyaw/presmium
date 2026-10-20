import { currentLocale, NAVIGATION, SYNC_TRANSPORTS, TOOLBAR, useServer } from '@lincyaw/host'
import { CLASSROOM_STORE, isRecord, PRESENTER_PANELS, SESSION } from '@lincyaw/kernel'
import type { PluginDefinition, Unsubscribe } from '@lincyaw/kernel'
import { watch } from 'vue'
import { version } from '../../package.json'
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

const SERVER_WAIT_MS = 5000

async function ownServer(): Promise<{ server: string, params: Record<string, string> } | undefined> {
  const client = useServer()
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

export const sessionPlugin: PluginDefinition = {
  manifest: {
    id: SESSION_ID,
    version,
    kernel: '^1.0.0',
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
