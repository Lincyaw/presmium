import { Kernel, PRESENTER_PANELS } from '@lincyaw/kernel'
import type { EnvironmentSpec, Logger, PluginDefinition, PluginReport, PresentationMode, ServiceToken, StartReport } from '@lincyaw/kernel'
import { createStore } from './store.ts'
import { connectActions } from './actions.ts'
import { PmApprovals } from './approvals.ts'
import { NAVIGATION, OPERATIONS, PLAYBACK_CONTROL, STATUS, STEP_CLOCK, SYNC_TRANSPORTS, TIMED_CAPTIONS, TOOLBAR } from './contracts.ts'
import type { Navigation, ServerClient, SyncTransports } from './contracts.ts'
import { connectControl } from './control.ts'
import { componentErrors } from './error-boundary.ts'
import { currentLocale } from './locale.ts'
import { HOST_MESSAGES } from './messages.ts'
import { createOperations } from './operations.ts'
import { createPlaybackControl } from './playback-control.ts'
import { createPresenterPanels, createStatusRegistry, createTimedCaptions, createToolbar } from './registries.ts'
import { provideServer } from './server.ts'
import { createStepClock } from './step-clock.ts'

export const runtimeRevision = createStore(0)

const registered: PluginDefinition[] = []
const running = createStore<Kernel | undefined>(undefined)
let starting: Promise<StartReport> | undefined
interface RuntimeOwner { kernel: Kernel, releases: (() => void)[], started?: Promise<StartReport> }
let runtime: RuntimeOwner | undefined
let lifecycle: Promise<unknown> = Promise.resolve()
const failures = createStore<PluginReport[]>([])
let resumeHost: (() => Promise<StartReport>) | undefined
let hostActive = true
let resumePage: (() => void) | undefined
let watchingPage = false

export function registerPresmiumPlugin(plugin: PluginDefinition): void {
  const { id } = plugin.manifest
  if (starting) console.error(`[presmium] ${id} was registered after the kernel started; ignored`)
  else if (registered.some(p => p.manifest.id === id)) console.error(`[presmium] plugin ${id} is already registered; ignored`)
  else registered.push(plugin)
}

function isPluginDefinition(value: unknown): value is PluginDefinition {
  const plugin = value as Partial<PluginDefinition> | null
  return typeof plugin === 'object' && plugin !== null && typeof plugin.setup === 'function' && typeof plugin.manifest?.id === 'string'
}

export function pluginsOf(module: unknown): PluginDefinition[] {
  const values = Object.values((module ?? {}) as Record<string, unknown>).flatMap(v => (Array.isArray(v) ? v : [v]))
  return [...new Set(values.filter(isPluginDefinition))]
}

interface StartOptions {
  mode: PresentationMode
  config?: Record<string, unknown>
  beforeStart?(kernel: Kernel, release: (stop: () => void) => void): void
  log?: Logger
  environments?: Record<string, EnvironmentSpec>
}

function transition<T>(change: () => Promise<T>): Promise<T> {
  const next = lifecycle.then(change)
  lifecycle = next.catch(() => undefined)
  return next
}

function startKernel(options: StartOptions): Promise<StartReport> {
  starting = transition(async () => {
    if (runtime) return runtime.started!
    const owner: RuntimeOwner = { kernel: new Kernel({ mode: options.mode, config: options.config, log: options.log, environments: options.environments }), releases: [] }
    runtime = owner
    owner.started = (async () => {
      options.beforeStart?.(owner.kernel, stop => owner.releases.push(stop))
      for (const plugin of registered) owner.kernel.register(plugin)
      const report = await owner.kernel.start()
      running.set(owner.kernel); runtimeRevision.set(n => n + 1)
      return report
    })()
    return owner.started
  })
  return starting
}

/** Stops the kernel and disposes the plugins; `startHost` or `setHostActive(true)` starts it again. */
export function stopHost(): Promise<void> {
  const requested = starting
  return transition(async () => {
    const owner = runtime
    try {
      if (!owner) return
      if (running.getSnapshot() === owner.kernel) {
        running.set(undefined); runtimeRevision.set(n => n + 1)
      }
      const results = await Promise.allSettled([
        ...owner.releases.splice(0).reverse().map(async release => release()),
        owner.kernel.dispose(),
      ])
      const failed = results.find(result => result.status === 'rejected')
      if (failed?.status === 'rejected') throw failed.reason
    } finally {
      if (runtime === owner) runtime = undefined
      if (starting === requested) starting = undefined
    }
  })
}

function stopOnPageHide(start: () => void): void {
  resumePage = start
  if (watchingPage) return
  watchingPage = true
  window.addEventListener('pagehide', () => void stopHost())
  window.addEventListener('pageshow', (event) => {
    if (event.persisted && hostActive) resumePage?.()
  })
}

export async function setHostActive(active: boolean): Promise<void> {
  hostActive = active
  if (active) await resumeHost?.()
  else await stopHost()
}

export function presmiumService<T>(token: ServiceToken<T>): T | undefined {
  return running.getSnapshot()?.getService(token)
}

export function reportPluginFailure(id: string, reason: string): void {
  failures.set([...failures.getSnapshot().filter(report => report.id !== id), { id, status: 'failed', reason }]); runtimeRevision.set(n => n + 1)
}

export function presmiumReport(): StartReport | undefined {
  const report = running.getSnapshot()?.report()
  return report && failures.getSnapshot().length ? { ...report, plugins: [...report.plugins, ...failures.getSnapshot()] } : report
}

export interface HostStart {
  mode: PresentationMode
  config: Record<string, unknown>
  navigation: Navigation
  transports: SyncTransports
  environments?: Record<string, EnvironmentSpec>
  server?: ServerClient
}

export function startHost(options: HostStart): Promise<StartReport> {
  if (options.server) provideServer(options.server)
  const start = () => startKernel({
    mode: options.mode,
    config: options.config,
    environments: options.environments,
    beforeStart(kernel, release) {
      const toolbar = createToolbar()
      const status = createStatusRegistry()
      kernel.provide(PRESENTER_PANELS, createPresenterPanels())
      kernel.provide(SYNC_TRANSPORTS, options.transports)
      kernel.provide(NAVIGATION, options.navigation)
      kernel.provide(TOOLBAR, toolbar)
      const operations = createOperations()
      connectActions(operations)
      kernel.provide(OPERATIONS, operations)
      kernel.provide(PLAYBACK_CONTROL, createPlaybackControl())
      kernel.provide(TIMED_CAPTIONS, createTimedCaptions())
      const stepClock = createStepClock(options.navigation)
      release(stepClock.stop)
      kernel.provide(STEP_CLOCK, stepClock.clock)
      kernel.provide(STATUS, status)
      status.register({
        id: 'presmium.runtime',
        read: () => ({
          plugins: (presmiumReport()?.plugins ?? []).slice(-40).map(plugin => ({ id: plugin.id, status: plugin.status, ...plugin.reason ? { reason: plugin.reason.slice(0, 2000) } : {} })),
          errors: componentErrors().slice(-20).map(error => ({ component: error.component, message: error.message.slice(0, 2000) })),
        }),
      })
      const { server } = options
      if (!server?.available) return
      toolbar.register({
        id: 'presmium.approvals',
        get title() {
          return HOST_MESSAGES[currentLocale()].approvalsTitle
        },
        component: PmApprovals,
        order: 1000,
      })
      release(connectControl(server, { navigation: options.navigation, status, service: token => kernel.getService(token) }))
    },
  })
  resumeHost = start
  hostActive = true
  stopOnPageHide(() => void setHostActive(true))
  return start()
}
