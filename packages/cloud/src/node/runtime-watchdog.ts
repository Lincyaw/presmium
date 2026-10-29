import { CloudError } from '../domain/errors.ts'
import type { DockerEngine } from './docker.ts'

export interface RuntimeWatchdogOptions { instanceId: string, pollMs?: number }
const label = 'io.presmium.cloud'

/** A trusted process outside tenant PID/UID namespaces enforces immutable container deadlines. */
export class RuntimeWatchdog {
  readonly engine: DockerEngine
  readonly options: Required<RuntimeWatchdogOptions>
  #closed = false
  #pending: Promise<{ checked: number, stopped: number }> | undefined

  constructor(engine: DockerEngine, options: RuntimeWatchdogOptions) {
    const pollMs = options.pollMs ?? 5000
    if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(options.instanceId) || !Number.isSafeInteger(pollMs) || pollMs < 1000 || pollMs > 60_000) throw new CloudError(500, 'runtime-watchdog-configuration-invalid')
    this.engine = engine
    this.options = { instanceId: options.instanceId, pollMs }
  }

  tick(): Promise<{ checked: number, stopped: number }> {
    if (this.#pending) return this.#pending
    this.#pending = this.#tick().finally(() => { this.#pending = undefined })
    return this.#pending
  }

  async #tick() {
    const found = await this.engine.containers({ [`${label}.instance`]: this.options.instanceId })
    let checked = 0, stopped = 0, failed = 0
    for (let offset = 0; offset < found.length; offset += 4) {
      await Promise.all(found.slice(offset, offset + 4).map(async item => {
        try {
          const container = await this.engine.inspect(item.Id)
          const labels = container?.Config.Labels
          if (!container?.State.Running || labels?.[`${label}.instance`] !== this.options.instanceId || labels[`${label}.kind`] !== 'studio') return
          checked++
          const value = labels[`${label}.max-duration-seconds`] ?? ''
          const seconds = /^\d{1,5}$/.test(value) ? Number(value) : 0
          const started = Date.parse(container.State.StartedAt)
          const invalid = !Number.isSafeInteger(seconds) || seconds < 1 || seconds > 7 * 86_400 || !Number.isFinite(started) || started <= 0 || started > Date.now() + 5000
          if (invalid || Date.now() - started >= seconds * 1000) {
            // Zero grace also kills a tenant-stopped supervisor and processes ignoring SIGTERM.
            await this.engine.stop(container.Id, 0)
            if ((await this.engine.inspect(container.Id))?.State.Running) throw new CloudError(503, 'runtime-watchdog-stop-failed')
            stopped++
            process.stderr.write(`runtime watchdog: stopped ${container.Id} (${invalid ? 'invalid-deadline' : 'deadline-reached'})\n`)
          }
        } catch { failed++ }
      }))
    }
    if (failed) throw new CloudError(503, 'runtime-watchdog-reconciliation-failed', { failed, checked, stopped })
    return { checked, stopped }
  }

  async run(signal: AbortSignal): Promise<void> {
    while (!signal.aborted && !this.#closed) {
      try { await this.tick() }
      catch (error) { process.stderr.write(`runtime watchdog: ${error instanceof CloudError ? error.code : 'engine-unavailable'}\n`) }
      await new Promise<void>(done => {
        const finish = () => { clearTimeout(timer); signal.removeEventListener('abort', finish); done() }
        const timer = setTimeout(finish, this.options.pollMs)
        signal.addEventListener('abort', finish, { once: true })
        if (signal.aborted || this.#closed) finish()
      })
    }
  }

  async close(): Promise<void> { this.#closed = true; await this.#pending }
}
