import { KERNEL_VERSION } from './contracts.ts'
import type {
  EventBus,
  KernelEvent,
  Logger,
  PluginContext,
  PluginDefinition,
  PluginReport,
  PresentationMode,
  ServiceToken,
  StartReport,
} from './contracts.ts'
import { errorMessage } from './errors.ts'
import { createEventBus } from './events.ts'
import { ServiceRegistry } from './services.ts'

export interface KernelOptions {
  mode: PresentationMode
  /** The headmatter `presmium` object; each plugin receives `config[manifest.id]`. */
  config?: Record<string, unknown>
  log?: Logger
  events?: EventBus
}

/**
 * Aggregate root of the plugin system: registers plugins, starts them in
 * dependency order and isolates failures to the failing plugin and the plugins
 * that require its services.
 */
export class Kernel {
  readonly version = KERNEL_VERSION
  readonly mode: PresentationMode
  readonly services = new ServiceRegistry()
  readonly events: EventBus
  #log: Logger
  #config: Record<string, unknown>
  #plugins: PluginDefinition[] = []
  #state: 'idle' | 'starting' | 'started' | 'disposed' = 'idle'
  #report?: StartReport

  constructor(options: KernelOptions) {
    this.mode = options.mode
    this.#config = options.config ?? {}
    this.#log = options.log ?? console
    this.events = options.events ?? createEventBus((error, event) => {
      this.#log.error(`[presmium] handler for "${event.type}" threw`, error)
    })
  }

  register(plugin: PluginDefinition): void {
    if (this.#state !== 'idle') throw new Error(`cannot register ${plugin.manifest.id}: kernel already started`)
    if (this.#plugins.some(p => p.manifest.id === plugin.manifest.id)) {
      throw new Error(`plugin ${plugin.manifest.id} is already registered`)
    }
    this.#plugins.push(plugin)
  }

  /** Provides a host-level service. Call before `start` so plugins can require it. */
  provide<T>(token: ServiceToken<T>, impl: T): void {
    this.services.provide(token, impl)
  }

  getService<T>(token: ServiceToken<T>): T | undefined {
    return this.services.tryGet(token)
  }

  report(): StartReport | undefined {
    return this.#report
  }

  async start(): Promise<StartReport> {
    if (this.#state !== 'idle') throw new Error('kernel already started')
    this.#state = 'starting'
    const plan = this.services.plan(this.#plugins.map(p => p.manifest), this.version)
    const reports = new Map<string, PluginReport>()
    for (const [id, reason] of plan.excluded) reports.set(id, this.#disable(id, reason))

    const order: string[] = []
    for (const id of plan.order) {
      const plugin = this.#plugins.find(p => p.manifest.id === id)!
      const unavailable = (plugin.manifest.requires ?? []).filter(r => !this.services.has(r.token))
      const missing = unavailable.map(r => r.token.id)
      if (unavailable.some(r => !r.optional)) {
        const required = unavailable.filter(r => !r.optional).map(r => r.token.id)
        reports.set(id, this.#disable(id, `missing required services: ${required.join(', ')}`, missing))
        continue
      }
      order.push(id)
      reports.set(id, await this.#setup(plugin, missing))
    }

    this.#report = { order, plugins: this.#plugins.map(p => reports.get(p.manifest.id)!), cycles: plan.cycles }
    this.#state = 'started'
    return this.#report
  }

  /** Disposes running plugins in reverse start order. Errors are logged, not thrown. */
  async dispose(): Promise<void> {
    if (this.#state === 'disposed') return
    this.#state = 'disposed'
    const running = new Set(
      this.#report?.plugins.filter(r => r.status === 'started' || r.status === 'degraded').map(r => r.id),
    )
    for (const id of [...(this.#report?.order ?? [])].reverse()) {
      if (!running.has(id)) continue
      const plugin = this.#plugins.find(p => p.manifest.id === id)!
      try {
        await plugin.dispose?.()
      } catch (error) {
        this.#log.error(`[presmium] ${id} dispose failed`, error)
      }
      this.services.revoke(id)
    }
  }

  async #setup(plugin: PluginDefinition, missing: string[]): Promise<PluginReport> {
    const { id, provides = [] } = plugin.manifest
    try {
      await plugin.setup(this.#context(plugin))
      const unprovided = provides.filter(t => this.services.owner(t) !== id).map(t => t.id)
      if (unprovided.length > 0) throw new Error(`declared but did not provide: ${unprovided.join(', ')}`)
    } catch (error) {
      this.services.revoke(id)
      const reason = errorMessage(error)
      this.#log.error(`[presmium] ${id} failed to start`, error)
      this.#emit({ type: 'kernel.plugin.failed', payload: { id, error: reason } })
      return { id, status: 'failed', reason }
    }
    if (missing.length > 0) {
      this.#log.warn(`[presmium] ${id} started without optional services: ${missing.join(', ')}`)
      this.#emit({ type: 'kernel.plugin.degraded', payload: { id, missing } })
      return { id, status: 'degraded', reason: `optional services unavailable: ${missing.join(', ')}`, missing }
    }
    this.#emit({ type: 'kernel.plugin.started', payload: { id } })
    return { id, status: 'started' }
  }

  #disable(id: string, reason: string, missing?: string[]): PluginReport {
    this.#log.warn(`[presmium] ${id} disabled: ${reason}`)
    this.#emit({ type: 'kernel.plugin.disabled', payload: { id, reason } })
    return missing ? { id, status: 'disabled', reason, missing } : { id, status: 'disabled', reason }
  }

  #emit(event: KernelEvent): void {
    this.events.emit(event)
  }

  #context(plugin: PluginDefinition): PluginContext {
    const { id, provides = [], requires = [] } = plugin.manifest
    const declared = new Set([...requires.map(r => r.token.id), ...provides.map(t => t.id)])
    const assertDeclared = (token: ServiceToken<unknown>) => {
      if (!declared.has(token.id)) throw new Error(`${id} did not declare service ${token.id} in its manifest`)
    }
    return {
      config: pluginConfig(this.#config[id]),
      mode: this.mode,
      provide: (token, impl) => {
        if (!provides.some(t => t.id === token.id)) {
          throw new Error(`${id} provides ${token.id} without declaring it in manifest.provides`)
        }
        this.services.provide(token, impl, id)
      },
      get: token => {
        assertDeclared(token)
        return this.services.get(token)
      },
      tryGet: token => {
        assertDeclared(token)
        return this.services.tryGet(token)
      },
      events: this.events,
      log: prefixed(this.#log, id),
    }
  }
}

function pluginConfig(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {}
}

function prefixed(log: Logger, id: string): Logger {
  const tag = `[${id}]`
  return {
    debug: (...args) => log.debug(tag, ...args),
    info: (...args) => log.info(tag, ...args),
    warn: (...args) => log.warn(tag, ...args),
    error: (...args) => log.error(tag, ...args),
  }
}
