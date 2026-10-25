import { Kernel, PRESENTER_PANELS } from '@lincyaw/kernel'
import type { EnvironmentSpec, Logger, PluginDefinition, PluginReport, PresentationMode, ServiceToken, StartReport } from '@lincyaw/kernel'
import { createStore } from './store.ts'
import { connectActions } from './actions.ts'
import { PmApprovals } from './approvals.ts'
import { NAVIGATION, OPERATIONS, PLAYBACK_CONTROL, STATUS, STEP_CLOCK, SYNC_TRANSPORTS, TOOLBAR } from './contracts.ts'
import type { Navigation, ServerClient, SyncTransports } from './contracts.ts'
import { connectControl } from './control.ts'
import { componentErrors } from './error-boundary.ts'
import { currentLocale } from './locale.ts'
import { HOST_MESSAGES } from './messages.ts'
import { createOperations } from './operations.ts'
import { createPlaybackControl } from './playback-control.ts'
import { createPresenterPanels, createStatusRegistry, createToolbar } from './registries.ts'
import { provideServer } from './server.ts'
import { createStepClock } from './step-clock.ts'

export const runtimeRevision = createStore(0)

const registered: PluginDefinition[] = []
const running = createStore<Kernel | undefined>(undefined)
let starting: Promise<StartReport> | undefined
let disconnect: (() => void) | undefined
let stopClock: (() => void) | undefined
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
  beforeStart?(kernel: Kernel): void
  log?: Logger
  environments?: Record<string, EnvironmentSpec>
}

function startKernel(options: StartOptions): Promise<StartReport> {
  starting ??= (async () => {
    const kernel = new Kernel({ mode: options.mode, config: options.config, log: options.log, environments: options.environments })
    options.beforeStart?.(kernel)
    for (const plugin of registered) kernel.register(plugin)
    const report = await kernel.start()
    running.set(kernel); runtimeRevision.set(n => n + 1)
    return report
  })()
  return starting
}

/** Stops the kernel and disposes the plugins; `startHost` or `setHostActive(true)` starts it again. */
export async function stopHost(): Promise<void> {
  const current = starting
  if (!current) return
  starting = undefined
  disconnect?.()
  disconnect = undefined
  stopClock?.()
  stopClock = undefined
  await current.catch(() => undefined)
  const kernel = running.getSnapshot()
  running.set(undefined); runtimeRevision.set(n => n + 1)
  await kernel?.dispose()
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
    beforeStart(kernel) {
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
      stopClock?.()
      const stepClock = createStepClock(options.navigation)
      stopClock = stepClock.stop
      kernel.provide(STEP_CLOCK, stepClock.clock)
      kernel.provide(STATUS, status)
      status.register({
        id: 'presmium.runtime',
        read: () => ({
          plugins: (presmiumReport()?.plugins ?? []).slice(-40).map(plugin => ({ id: plugin.id, status: plugin.status, ...plugin.reason ? { reason: plugin.reason.slice(0, 2000) } : {} })),
          errors: componentErrors().slice(-20).map(error => ({ component: error.component, message: error.message.slice(0, 2000) })),
        }),
      })
      disconnect?.()
      disconnect = undefined
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
      disconnect = connectControl(server, { navigation: options.navigation, status, service: token => kernel.getService(token) })
    },
  })
  resumeHost = start
  hostActive = true
  stopOnPageHide(() => void setHostActive(true))
  return start()
}
