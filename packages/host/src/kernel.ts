import { Kernel, PRESENTER_PANELS } from '@lincyaw/kernel'
import type { EnvironmentSpec, Logger, PluginDefinition, PluginReport, PresentationMode, ServiceToken, StartReport } from '@lincyaw/kernel'
import { shallowRef } from 'vue'
import { PmApprovals } from './approvals.ts'
import { currentLocale } from './locale.ts'
import { HOST_MESSAGES } from './messages.ts'
import { createOperations, createStatusRegistry } from './operations.ts'
import { createPresenterPanels, createToolbar } from './panels.ts'
import { connectControl, provideServer } from './server.ts'
import { NAVIGATION, OPERATIONS, STATUS, SYNC_TRANSPORTS, TOOLBAR } from './types.ts'
import type { Navigation, ServerClient, SyncTransports } from './types.ts'

const registered: PluginDefinition[] = []
const running = shallowRef<Kernel>()
let starting: Promise<StartReport> | undefined
let disconnect: (() => void) | undefined
const failures = shallowRef<PluginReport[]>([])
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

export function pluginsOf(module: unknown, config: Record<string, unknown> = {}): PluginDefinition[] {
  const exports = (module ?? {}) as Record<string, unknown>
  const declared = typeof exports.presmiumPlugins === 'function' ? [(exports.presmiumPlugins as (config: Record<string, unknown>) => unknown)(config)] : []
  const values = [...Object.values(exports), ...declared].flatMap(v => (Array.isArray(v) ? v : [v]))
  return [...new Set(values.filter(isPluginDefinition))]
}

export interface StartOptions {
  mode: PresentationMode
  config?: Record<string, unknown>
  beforeStart?(kernel: Kernel): void
  log?: Logger
  environments?: Record<string, EnvironmentSpec>
}

export function startPresmium(options: StartOptions): Promise<StartReport> {
  starting ??= (async () => {
    const kernel = new Kernel({ mode: options.mode, config: options.config, log: options.log, environments: options.environments })
    options.beforeStart?.(kernel)
    for (const plugin of registered) kernel.register(plugin)
    const report = await kernel.start()
    running.value = kernel
    return report
  })()
  return starting
}

export async function stopPresmium(): Promise<void> {
  const current = starting
  if (!current) return
  starting = undefined
  disconnect?.()
  disconnect = undefined
  await current.catch(() => undefined)
  const kernel = running.value
  running.value = undefined
  await kernel?.dispose()
}

export function stopPresmiumOnPageHide(start: () => void): void {
  resumePage = start
  if (watchingPage) return
  watchingPage = true
  window.addEventListener('pagehide', () => void stopPresmium())
  window.addEventListener('pageshow', (event) => {
    if (event.persisted && hostActive) resumePage?.()
  })
}

export async function setHostActive(active: boolean): Promise<void> {
  hostActive = active
  if (active) await resumeHost?.()
  else await stopPresmium()
}

export function presmiumService<T>(token: ServiceToken<T>): T | undefined {
  return running.value?.getService(token)
}

export function reportPluginFailure(id: string, reason: string): void {
  failures.value = [...failures.value.filter(report => report.id !== id), { id, status: 'failed', reason }]
}

export function presmiumReport(): StartReport | undefined {
  const report = running.value?.report()
  return report && failures.value.length ? { ...report, plugins: [...report.plugins, ...failures.value] } : report
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
  const start = () => startPresmium({
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
      kernel.provide(OPERATIONS, createOperations())
      kernel.provide(STATUS, status)
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
  stopPresmiumOnPageHide(() => void setHostActive(true))
  return start()
}
