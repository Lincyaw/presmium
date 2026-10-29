import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { runtimeBin } from './runtime.ts'

const PACKAGE = '@lincyaw/studio'
const START_TIMEOUT = 180_000
const STOP_TIMEOUT = 35_000

export type StudioLaunchErrorCode = 'studio-not-installed' | 'studio-start-failed' | 'studio-start-timeout' | 'studio-invalid-url' | 'studio-closed'

/** The extension maps these codes to its own localized messages. */
export class StudioLaunchError extends Error {
  readonly code: StudioLaunchErrorCode

  constructor(code: StudioLaunchErrorCode) {
    super(code)
    this.name = 'StudioLaunchError'
    this.code = code
  }
}

export interface StudioLauncherOptions {
  runtime: string
  extensionPath: string
  /** Diagnostic lines with credentials removed; the authenticated startup URL is never logged. */
  log?(line: string): void
}

interface RunningStudio {
  url: Promise<string>
  stop(): Promise<void>
}

function localUrl(value: string): string | undefined {
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' || url.username || url.password || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return undefined
    return url.href
  } catch { return undefined }
}

function redact(line: string): string {
  return line
    .replace(/([?&](?:token|access_token|api_key|key)=)[^\s&#"'<>]*/gi, '$1[redacted]')
    .replace(/(\bAuthorization\s*:\s*Bearer\s+)\S+/gi, '$1[redacted]')
    .replace(/(["']?(?:token|access_token|api_key)["']?\s*[:=]\s*["']?)[^\s,"'}&]+/gi, '$1[redacted]')
}

/** One owned Studio process per explicitly selected workspace; opening it never launches a browser itself. */
export class StudioLauncher {
  readonly #options: StudioLauncherOptions
  readonly #instances = new Map<string, RunningStudio>()
  readonly #processes = new Set<RunningStudio>()
  #closing?: Promise<void>

  constructor(options: StudioLauncherOptions) {
    this.#options = options
  }

  urlOf(dir: string): Promise<string> {
    if (this.#closing) return Promise.reject(new StudioLaunchError('studio-closed'))
    const root = resolve(dir)
    const known = this.#instances.get(root)
    if (known) return known.url
    let bin: string
    try { bin = runtimeBin(PACKAGE, 'presmium-studio', root, this.#options.extensionPath) ?? ''; if (!bin) throw new StudioLaunchError('studio-not-installed') }
    catch (error) { return Promise.reject(error) }
    let instance: RunningStudio
    try { instance = this.#launch(root, bin) }
    catch { return Promise.reject(new StudioLaunchError('studio-start-failed')) }
    this.#instances.set(root, instance)
    this.#processes.add(instance)
    void instance.url.catch(() => {
      if (this.#instances.get(root) === instance) this.#instances.delete(root)
      void instance.stop()
    })
    return instance.url
  }

  #launch(dir: string, bin: string): RunningStudio {
    const child: ChildProcess = spawn(this.#options.runtime, [bin, dir, '--port', '0'], {
      cwd: dir,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const stdout = createInterface({ input: child.stdout! })
    const stderr = createInterface({ input: child.stderr! })
    let ended = false, stopping = false, settled = false
    let resolveUrl!: (url: string) => void, rejectUrl!: (error: StudioLaunchError) => void
    let resolveExit!: () => void
    const exited = new Promise<void>(done => resolveExit = done)
    const url = new Promise<string>((ready, failed) => { resolveUrl = ready; rejectUrl = failed })
    const reject = (code: StudioLaunchErrorCode) => {
      if (settled) return
      settled = true
      clearTimeout(startTimer)
      rejectUrl(new StudioLaunchError(code))
    }
    const startTimer = setTimeout(() => reject('studio-start-timeout'), START_TIMEOUT)
    const finish = () => {
      if (ended) return
      ended = true
      clearTimeout(startTimer)
      stdout.close()
      stderr.close()
      child.stdout?.destroy()
      child.stderr?.destroy()
      reject(stopping || this.#closing ? 'studio-closed' : 'studio-start-failed')
      if (this.#instances.get(dir) === instance) this.#instances.delete(dir)
      this.#processes.delete(instance)
      resolveExit()
    }
    stdout.on('line', line => {
      if (settled || stopping || this.#closing) return
      const match = /^studio {2}(\S+)$/.exec(line)
      if (!match) return
      const address = localUrl(match[1]!)
      if (!address) { reject('studio-invalid-url'); return }
      settled = true
      clearTimeout(startTimer)
      resolveUrl(address)
    })
    stderr.on('line', line => {
      try { this.#options.log?.(redact(line)) } catch { /* Diagnostics must not interrupt shutdown or startup. */ }
    })
    child.on('error', () => {
      // A failed signal also emits error; it does not prove that a spawned process has exited.
      if (!child.pid) finish()
      else reject('studio-start-failed')
    })
    child.once('exit', finish)
    let stop: Promise<void> | undefined
    const instance: RunningStudio = {
      url,
      stop() {
        return stop ??= (async () => {
          stopping = true
          reject('studio-closed')
          if (ended) return
          if (process.platform === 'win32' && child.pid) {
            // Only an explicit stop reaches this branch; a healthy launch is never force-killed.
            const task = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
            task.once('error', () => child.kill())
            task.once('exit', code => { if (code !== 0) child.kill() })
          } else child.kill('SIGTERM')
          const timer = setTimeout(() => child.kill('SIGKILL'), STOP_TIMEOUT)
          try { await exited } finally { clearTimeout(timer) }
        })()
      },
    }
    return instance
  }

  close(): Promise<void> {
    return this.#closing ??= (async () => {
      const instances = [...this.#processes]
      this.#instances.clear()
      await Promise.all(instances.map(instance => instance.stop()))
    })()
  }
}
