import { Kernel } from '@presmium/kernel'
import type { Logger, PluginDefinition, PresentationMode, ServiceToken, StartReport } from '@presmium/kernel'
import { shallowRef } from 'vue'

const registered: PluginDefinition[] = []
const running = shallowRef<Kernel>()
let starting: Promise<StartReport> | undefined

/**
 * Registers a plugin for the kernel start. Addons call it from `setup/main.ts`;
 * late or duplicate registrations are reported and ignored so one addon cannot
 * stop the deck from starting.
 */
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

/**
 * The kernel plugins of a plugin package's browser entry, `src/client/plugin.ts`,
 * from which both hosts register them: plugin definitions exported by default
 * or by name, single or in arrays, and the definitions returned by an exported
 * `presmiumPlugins(config)` for the deck's `presmium` configuration (plugins
 * that only start when the deck asks for them).
 */
export function pluginsOf(module: unknown, config: Record<string, unknown> = {}): PluginDefinition[] {
  const exports = (module ?? {}) as Record<string, unknown>
  const declared = typeof exports.presmiumPlugins === 'function' ? [(exports.presmiumPlugins as (config: Record<string, unknown>) => unknown)(config)] : []
  const values = [...Object.values(exports), ...declared].flatMap(v => (Array.isArray(v) ? v : [v]))
  return [...new Set(values.filter(isPluginDefinition))]
}

export interface StartOptions {
  mode: PresentationMode
  /** The headmatter `presmium` object. */
  config?: Record<string, unknown>
  /** Provides host-level services before plugins start. */
  beforeStart?(kernel: Kernel): void
  log?: Logger
}

/**
 * Starts the kernel with every registered plugin. Only the first call starts
 * it; later calls share its result, until `stopPresmium`.
 */
export function startPresmium(options: StartOptions): Promise<StartReport> {
  starting ??= (async () => {
    const kernel = new Kernel({ mode: options.mode, config: options.config, log: options.log })
    options.beforeStart?.(kernel)
    for (const plugin of registered) kernel.register(plugin)
    const report = await kernel.start()
    running.value = kernel
    return report
  })()
  return starting
}

/**
 * Disposes the running plugins in reverse start order (their `dispose`) and
 * forgets the kernel, so `startPresmium` can start the registered plugins
 * again. Host adapters call it when the page goes away (`pagehide`) and when
 * a hot update replaces the module that started the kernel.
 */
export async function stopPresmium(): Promise<void> {
  const current = starting
  if (!current) return
  starting = undefined
  await current.catch(() => undefined)
  const kernel = running.value
  running.value = undefined
  await kernel?.dispose()
}

/**
 * Stops the kernel when the page is hidden for good or kept for later
 * (back-forward cache), and starts it again with `start` when such a page
 * is shown again. For host adapters, in the browser.
 */
export function stopPresmiumOnPageHide(start: () => void): void {
  window.addEventListener('pagehide', () => void stopPresmium())
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) start()
  })
}

/** Reactive service lookup; undefined until the kernel has started. Host adapters delegate `getService` here. */
export function presmiumService<T>(token: ServiceToken<T>): T | undefined {
  return running.value?.getService(token)
}

/** Reactive start report; undefined until the kernel has started. Host adapters delegate `startReport` here. */
export function presmiumReport(): StartReport | undefined {
  return running.value?.report()
}
