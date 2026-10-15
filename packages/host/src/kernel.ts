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

export interface StartOptions {
  mode: PresentationMode
  /** The headmatter `presmium` object. */
  config?: Record<string, unknown>
  /** Provides host-level services before plugins start. */
  beforeStart?(kernel: Kernel): void
  log?: Logger
}

/** Starts the kernel with every registered plugin. Only the first call starts it; later calls share its result. */
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

/** Reactive service lookup; undefined until the kernel has started. Host adapters delegate `getService` here. */
export function presmiumService<T>(token: ServiceToken<T>): T | undefined {
  return running.value?.getService(token)
}

/** Reactive start report; undefined until the kernel has started. Host adapters delegate `startReport` here. */
export function presmiumReport(): StartReport | undefined {
  return running.value?.report()
}
