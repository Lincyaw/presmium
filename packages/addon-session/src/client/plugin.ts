import { currentLocale, NAVIGATION, siteBase, SYNC_TRANSPORTS, TOOLBAR, serverClient } from '@lincyaw/host'
import { CLASSROOM_STORE, isRecord, PRESENTER_PANELS, SESSION } from '@lincyaw/kernel'
import type { PluginDefinition, Unsubscribe } from '@lincyaw/kernel'
import { version } from '../../package.json'
import { localServer, MESSAGES, reachableServer, SESSION_ID, toSessionConfig } from '../domain/index.ts'
import type { LocalClassroom } from '../domain/index.ts'
import { createClassroomConnection } from './classroom-connection.ts'
import { tryStorage } from './membership-storage.ts'
import SessionPanel from './SessionPanel.tsx'
import SessionToolbar from './SessionToolbar.tsx'

let cleanup: Unsubscribe[] = []

const SERVER_WAIT_MS = 5000

async function fetchLocalServer(): Promise<{ server: string, params: Record<string, string> } | undefined> {
  let client = serverClient()
  const available = client.available || await new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => done(false), SERVER_WAIT_MS)
    const poll = setInterval(() => { client = serverClient(); if (client.available) done(true) }, 50)
    const stop = () => clearInterval(poll)
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
    name: { 'zh-CN': '课堂同步', en: 'Classroom Sync' },
    version,
    kernel: '^1.0.0',
    provides: [SESSION, CLASSROOM_STORE],
    requires: [NAVIGATION, TOOLBAR, PRESENTER_PANELS, SYNC_TRANSPORTS].map(token => ({ token, optional: true })),
    capabilities: ['network'],
  },
  setup(ctx) {
    const { server } = toSessionConfig(ctx.config)
    const connection = createClassroomConnection({
      server: server && reachableServer(server, location.hostname),
      navigation: ctx.tryGet(NAVIGATION),
      base: new URL(siteBase(), location.href).href,
      storage: tryStorage(() => window.localStorage),
      tabStorage: tryStorage(() => window.sessionStorage),
    })
    ctx.provide(SESSION, connection.session)
    ctx.provide(CLASSROOM_STORE, connection.store)
    const title = MESSAGES[currentLocale()].classroom
    let disposed = false
    const show = () => [
      // The toolbar button also mounts the learner's badge, once per page (SessionOverlays).
      ctx.tryGet(TOOLBAR)?.register({ id: SESSION_ID, title, component: SessionToolbar }),
      ctx.tryGet(PRESENTER_PANELS)?.register({ id: SESSION_ID, title, component: SessionPanel, order: 10 }),
    ]
    cleanup = [connection.dispose, ctx.tryGet(SYNC_TRANSPORTS)?.add(connection.transport)].filter(stop => stop !== undefined)
    if (server !== undefined) {
      cleanup.push(...show().filter(stop => stop !== undefined))
      void connection.resume(location.search)
      return
    }
    void fetchLocalServer().then((local) => {
      if (disposed) return
      if (local) connection.setServer(local.server, local.params)
      if (local || import.meta.env.DEV) cleanup.push(...show().filter(stop => stop !== undefined))
      return connection.resume(location.search)
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
