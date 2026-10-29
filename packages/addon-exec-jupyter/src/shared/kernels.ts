import { errorMessage, failedRun, languageId } from '@lincyaw/kernel'
import type { RunRequest, RunResult } from '@lincyaw/kernel'
import type { ServerConnection } from '@jupyterlab/services'
import { argsPrelude } from '../domain/args.ts'
import { DEFAULT_TIMEOUT_MS } from '../domain/config.ts'
import { OutputCollector } from '../domain/outputs.ts'
import { executeCode, writeRunFiles } from './execute.ts'
import { createJupyterKernelLifecycle, failureCode } from './kernel-lifecycle.ts'
import type { JupyterFailure, JupyterKernelHandle, ShutdownJupyterKernel } from './kernel-lifecycle.ts'
import { loadJupyterServices } from './load-services.ts'
import { isRefused } from './refusal.ts'

export interface JupyterKernelsText {
  /** `error` is the failure's own words, for logs; `code` is set when the failure is one the reader's text names. */
  unreachable(error: string, code?: JupyterFailure): string
  refused: string
  noKernel(kernel: string, known: string[]): string
  wrongLanguage(kernel: string, language: string, lang: string): string
  timedOut(seconds: number): string
}

export interface JupyterKernelsOptions {
  executorId: string
  kernelName: string
  languages?: string[]
  settings(): Promise<ServerConnection.ISettings>
  shutdown?: ShutdownJupyterKernel
  cleanupFailed?(error: unknown): void
  refused?(): void
  text: JupyterKernelsText
}

export interface JupyterKernelDescription {
  spec: unknown
  implementation: string
  implementationVersion: string
  language: string
  languageVersion: string
}

export interface JupyterKernels {
  supports(lang: string): boolean
  run(request: RunRequest, signal?: AbortSignal): Promise<RunResult>
  endSession(session: string): Promise<void>
  describe(): Promise<JupyterKernelDescription>
  probe(): Promise<string | undefined>
  dispose(): Promise<void>
}

interface RunSession {
  kernel?: Promise<JupyterKernelHandle>
  tail: Promise<unknown>
}

/** The kernels of a Jupyter environment: one per session, kept until the session ends, and one for each run outside a session. */
export function createJupyterKernels(options: JupyterKernelsOptions): JupyterKernels {
  const runSessions = new Map<string, RunSession>()
  const lifecycle = createJupyterKernelLifecycle({ kernelName: options.kernelName, shutdown: options.shutdown })
  let specs: Promise<{ language: string, names: string[] }> | undefined

  const failedWith = (reason: string, started = Date.now()) => failedRun(options.executorId, reason, Date.now() - started)

  /** A request to Jupyter failed: the credentials were refused, or the server cannot be reached. */
  const failedRequest = (error: unknown, started: number): RunResult => {
    if (isRefused(error)) {
      options.refused?.()
      return failedWith(options.text.refused, started)
    }
    return failedWith(options.text.unreachable(errorMessage(error), failureCode(error)), started)
  }

  /** The connection's settings, or the failed run when there are none (no address, refused credentials). */
  const settingsOrFailedRun = async (): Promise<ServerConnection.ISettings | RunResult> => {
    try {
      return await options.settings()
    } catch (error) {
      if (isRefused(error)) {
        options.refused?.()
        return failedWith(options.text.refused)
      }
      return failedWith(errorMessage(error))
    }
  }

  const kernelSpecs = async (settings: ServerConnection.ISettings) => {
    specs ??= loadJupyterServices().then(s => s.KernelSpecAPI.getSpecs(settings)).then(models => ({
      language: models.kernelspecs[options.kernelName]?.language ?? '',
      names: Object.keys(models.kernelspecs),
    }))
    try {
      return await specs
    } catch (error) {
      specs = undefined
      throw error
    }
  }

  const runIn = async (kernel: () => Promise<JupyterKernelHandle>, request: RunRequest, signal: AbortSignal | undefined, settings: ServerConnection.ISettings, started: number): Promise<RunResult> => {
    let handle: JupyterKernelHandle
    try {
      signal?.throwIfAborted()
      if (!options.languages) {
        const { language, names } = await kernelSpecs(settings)
        if (!names.includes(options.kernelName)) return failedWith(options.text.noKernel(options.kernelName, names), started)
        if (language && languageId(language) !== languageId(request.lang)) return failedWith(options.text.wrongLanguage(options.kernelName, language, request.lang), started)
      }
      signal?.throwIfAborted()
      handle = await kernel()
      signal?.throwIfAborted()
      if (request.files && Object.keys(request.files).length) await writeRunFiles(handle, settings, request.files)
    } catch (error) {
      if (signal?.aborted) return failedWith(errorMessage(signal.reason), started)
      return failedRequest(error, started)
    }
    const timeoutMs = request.timeoutMs && request.timeoutMs > 0 ? request.timeoutMs : DEFAULT_TIMEOUT_MS
    const prelude = argsPrelude(request.args, request.lang)
    const collector = new OutputCollector()
    const shutdown = () => lifecycle.shutdown(handle)
    let status: string
    let timedOut = false
    try {
      if (prelude) await executeCode(handle, prelude, { stdin: '', timeoutMs, signal, shutdown })
      const outcome = await executeCode(handle, request.code, { stdin: request.stdin ?? '', collector, timeoutMs, signal, shutdown })
      status = outcome.status
      timedOut = outcome.timedOut
    } catch (error) {
      if (signal?.aborted) return failedWith(errorMessage(signal.reason), started)
      return failedRequest(error, started)
    }
    const { stdout, stderr } = collector.text()
    return {
      ok: status === 'ok' && !timedOut,
      stdout,
      stderr: timedOut ? `${stderr}${options.text.timedOut(timeoutMs / 1000)}\n` : stderr,
      exitCode: timedOut ? null : status === 'ok' ? 0 : 1,
      durationMs: Date.now() - started,
      timedOut,
      source: 'live',
      executorId: options.executorId,
      outputs: collector.outputs,
    }
  }

  const sessionKernel = (runSession: RunSession, settings: ServerConnection.ISettings) => async (): Promise<JupyterKernelHandle> => {
    const known = runSession.kernel ? await runSession.kernel.catch(() => undefined) : undefined
    if (known && !known.connection.isDisposed && known.connection.status !== 'dead') return known
    runSession.kernel = lifecycle.start(settings)
    runSession.kernel.catch(() => {
      runSession.kernel = undefined
    })
    return runSession.kernel
  }

  const runOnce = async (request: RunRequest, signal?: AbortSignal): Promise<RunResult> => {
    const started = Date.now()
    const settings = await settingsOrFailedRun()
    if (!('baseUrl' in settings)) return settings
    let handle: JupyterKernelHandle | undefined
    try {
      return await runIn(async () => (handle = await lifecycle.start(settings)), request, signal, settings, started)
    } finally {
      if (handle) await lifecycle.shutdown(handle).catch((error) => {
        if (options.cleanupFailed) options.cleanupFailed(error)
        else console.warn('[presmium] Jupyter cleanup failed', error)
      })
    }
  }

  return {
    supports: lang => !options.languages || options.languages.some(l => languageId(l) === languageId(lang)),
    run(request, signal) {
      if (signal?.aborted) return Promise.resolve(failedWith(errorMessage(signal.reason)))
      if (lifecycle.disposed) return Promise.resolve(failedWith('the Jupyter environment has been disposed'))
      if (!request.session) return runOnce(request, signal)
      let runSession = runSessions.get(request.session)
      if (!runSession) {
        runSession = { tail: Promise.resolve() }
        runSessions.set(request.session, runSession)
      }
      const own = runSession
      const result = own.tail.then(async () => {
        const started = Date.now()
        const settings = await settingsOrFailedRun()
        if (!('baseUrl' in settings)) return settings
        return runIn(sessionKernel(own, settings), request, signal, settings, started)
      })
      own.tail = result.catch(() => undefined)
      return result
    },
    async endSession(session) {
      const known = runSessions.get(session)
      if (!known) return
      runSessions.delete(session)
      await known.tail
      const handle = await known.kernel?.catch(() => undefined)
      if (handle) await lifecycle.shutdown(handle)
    },
    async describe() {
      const settings = await options.settings()
      const { ServerConnection } = await loadJupyterServices()
      const response = await ServerConnection.makeRequest(`${settings.baseUrl}api/kernelspecs/${encodeURIComponent(options.kernelName)}`, {}, settings)
      if (!response.ok) throw await ServerConnection.ResponseError.create(response)
      const spec: unknown = await response.json()
      const handle = await lifecycle.start(settings)
      try {
        const info = await handle.connection.info
        return {
          spec,
          implementation: info.implementation,
          implementationVersion: info.implementation_version,
          language: info.language_info.name,
          languageVersion: info.language_info.version,
        }
      } finally {
        await lifecycle.shutdown(handle)
      }
    },
    async probe() {
      try {
        const settings = await options.settings()
        const { names } = await kernelSpecs(settings)
        return names.includes(options.kernelName) ? undefined : options.text.noKernel(options.kernelName, names)
      } catch (error) {
        specs = undefined
        return isRefused(error) ? options.text.refused : options.text.unreachable(errorMessage(error), failureCode(error))
      }
    },
    dispose() {
      const disposing = lifecycle.dispose()
      runSessions.clear()
      return disposing
    },
  }
}
