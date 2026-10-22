import { failedRun, languageId } from '@lincyaw/kernel'
import type { RunRequest, RunResult } from '@lincyaw/kernel'
import type { Kernel, ServerConnection } from '@jupyterlab/services'
import { DEFAULT_TIMEOUT_MS, RUNS_DIR } from '../domain/config.ts'
import { argumentsCode, OutputCollector } from '../domain/outputs.ts'

type Services = typeof import('@jupyterlab/services')

export interface KernelsText {
  unreachable(error: string): string
  refused: string
  noKernel(kernel: string, known: string[]): string
  wrongLanguage(kernel: string, language: string, lang: string): string
  timedOut(seconds: number): string
}

export interface KernelsOptions {
  executorId: string
  kernel: string
  languages?: string[]
  settings(): Promise<ServerConnection.ISettings>
  shutdown?(kernel: string, directory: string, settings: ServerConnection.ISettings): Promise<void>
  cleanupFailed?(error: unknown): void
  refused?(): void
  text: KernelsText
}

export interface KernelDescription {
  spec: unknown
  implementation: string
  implementationVersion: string
  language: string
  languageVersion: string
}

export interface Kernels {
  supports(lang: string): boolean
  run(request: RunRequest, signal?: AbortSignal): Promise<RunResult>
  endSession(session: string): Promise<void>
  describe(): Promise<KernelDescription>
  probe(): Promise<string | undefined>
  dispose(): Promise<void>
}

interface Handle {
  id: string
  dir: string
  connection: Kernel.IKernelConnection
}

interface Session {
  kernel?: Promise<Handle>
  tail: Promise<unknown>
}

const CONNECT_TIMEOUT_MS = 30_000
const INTERRUPT_GRACE_MS = 5_000

let loaded: Promise<Services> | undefined
export function services(): Promise<Services> {
  loaded ??= import('@jupyterlab/services')
  return loaded
}

function randomId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function statusOf(error: unknown): number | undefined {
  const response = (error as { response?: { status?: unknown } } | undefined)?.response
  return typeof response?.status === 'number' ? response.status : undefined
}

export function createKernels(options: KernelsOptions): Kernels {
  const sessions = new Map<string, Session>()
  const live = new Set<Handle>()
  const starting = new Set<Promise<Handle>>()
  const shuttingDown = new Map<Handle, Promise<void>>()
  let disposed = false
  let disposing: Promise<void> | undefined
  let specs: Promise<{ language: string, names: string[] }> | undefined

  const fail = (reason: string, started = Date.now()) => failedRun(options.executorId, reason, Date.now() - started)

  const settingsOrFail = async (): Promise<ServerConnection.ISettings | RunResult> => {
    try {
      return await options.settings()
    } catch (error) {
      const status = statusOf(error)
      if (status === 401 || status === 403) {
        options.refused?.()
        return fail(options.text.refused)
      }
      return fail(errorText(error))
    }
  }

  const failure = (error: unknown, started: number): RunResult => {
    const status = statusOf(error)
    if (status === 401 || status === 403) {
      options.refused?.()
      return fail(options.text.refused, started)
    }
    return fail(options.text.unreachable(errorText(error)), started)
  }

  const kernelSpecs = async (settings: ServerConnection.ISettings) => {
    specs ??= services().then(s => s.KernelSpecAPI.getSpecs(settings)).then(models => ({
      language: models.kernelspecs[options.kernel]?.language ?? '',
      names: Object.keys(models.kernelspecs),
    }))
    try {
      return await specs
    } catch (error) {
      specs = undefined
      throw error
    }
  }

  const start = (settings: ServerConnection.ISettings): Promise<Handle> => {
    if (disposed) return Promise.reject(new Error('the Jupyter environment has been disposed'))
    const task = (async () => {
      const { Drive, KernelAPI, KernelConnection } = await services()
      const dir = `${RUNS_DIR}/${randomId()}`
      const drive = new Drive({ serverSettings: settings })
      let handle: Handle | undefined
      await drive.save(RUNS_DIR, { type: 'directory' })
      try {
        await drive.save(dir, { type: 'directory' })
        const model = await KernelAPI.startNew({ name: options.kernel, path: `${dir}/kernel` } as { name: string }, settings)
        const connection = new KernelConnection({ model, serverSettings: settings, handleComms: false })
        handle = { id: model.id, dir, connection }
        live.add(handle)
        if (disposed) throw new Error('the Jupyter environment has been disposed')
        await connected(connection)
        if (disposed) throw new Error('the Jupyter environment has been disposed')
        return handle
      } catch (error) {
        await (handle ? shutdown(handle) : removeDirectory(settings, dir)).catch(() => {})
        throw error
      }
    })()
    starting.add(task)
    void task.then(() => starting.delete(task), () => starting.delete(task))
    return task
  }

  const shutdown = (handle: Handle): Promise<void> => {
    const known = shuttingDown.get(handle)
    if (known) return known
    // Invoke the handoff before yielding: pagehide cannot wait for later continuations.
    const cleanup = (options.shutdown ?? shutdownKernel)(handle.id, handle.dir, handle.connection.serverSettings)
    handle.connection.dispose()
    const task = cleanup.finally(() => {
      live.delete(handle)
      shuttingDown.delete(handle)
    })
    shuttingDown.set(handle, task)
    return task
  }

  const write = async (handle: Handle, settings: ServerConnection.ISettings, files: Record<string, string>) => {
    const { Drive } = await services()
    const drive = new Drive({ serverSettings: settings })
    for (const [path, content] of Object.entries(files)) {
      const parts = path.split('/').filter(Boolean)
      if (parts.length === 0 || parts.some(part => part === '..' || part === '.')) continue
      for (let i = 1; i < parts.length; i++) await drive.save(`${handle.dir}/${parts.slice(0, i).join('/')}`, { type: 'directory' })
      await drive.save(`${handle.dir}/${parts.join('/')}`, { type: 'file', format: 'text', content })
    }
  }

  const runIn = async (kernel: () => Promise<Handle>, request: RunRequest, signal: AbortSignal | undefined, settings: ServerConnection.ISettings, started: number): Promise<RunResult> => {
    let handle: Handle
    try {
      signal?.throwIfAborted()
      if (!options.languages) {
        const { language, names } = await kernelSpecs(settings)
        if (!names.includes(options.kernel)) return fail(options.text.noKernel(options.kernel, names), started)
        if (language && languageId(language) !== languageId(request.lang)) return fail(options.text.wrongLanguage(options.kernel, language, request.lang), started)
      }
      signal?.throwIfAborted()
      handle = await kernel()
      signal?.throwIfAborted()
      if (request.files && Object.keys(request.files).length) await write(handle, settings, request.files)
    } catch (error) {
      if (signal?.aborted) return fail(errorText(signal.reason), started)
      return failure(error, started)
    }
    const timeoutMs = request.timeoutMs && request.timeoutMs > 0 ? request.timeoutMs : DEFAULT_TIMEOUT_MS
    const preamble = argumentsCode(request.args, request.lang)
    const collector = new OutputCollector()
    let status: string
    let timedOut = false
    try {
      if (preamble) await execute(handle, preamble, '', undefined, timeoutMs, signal)
      const outcome = await execute(handle, request.code, request.stdin ?? '', collector, timeoutMs, signal)
      status = outcome.status
      timedOut = outcome.timedOut
    } catch (error) {
      if (signal?.aborted) return fail(errorText(signal.reason), started)
      return failure(error, started)
    }
    const { stdout, stderr } = collector.text()
    const result: RunResult = {
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
    return result
  }

  const execute = async (handle: Handle, code: string, stdin: string, collector: OutputCollector | undefined, timeoutMs: number, signal?: AbortSignal): Promise<{ status: string, timedOut: boolean }> => {
    const { KernelAPI } = await services()
    signal?.throwIfAborted()
    const lines = stdin ? stdin.replace(/\n$/, '').split('\n') : []
    const future = handle.connection.requestExecute({ code, silent: !collector, store_history: false, allow_stdin: true, stop_on_error: true })
    future.onIOPub = (msg) => {
      collector?.add(msg.header.msg_type, msg.content)
    }
    future.onStdin = (msg) => {
      if (msg.header.msg_type === 'input_request') handle.connection.sendInputReply({ status: 'ok', value: lines.shift() ?? '' }, msg.header as never)
    }
    let timedOut = false
    let stopping: ReturnType<typeof setTimeout> | undefined
    const interrupt = () => {
      if (stopping) return
      void KernelAPI.interruptKernel(handle.id, handle.connection.serverSettings).catch(() => {})
      stopping = setTimeout(() => void shutdown(handle).catch(() => {}), INTERRUPT_GRACE_MS)
    }
    const timer = setTimeout(() => {
      timedOut = true
      interrupt()
    }, timeoutMs)
    const abort = () => interrupt()
    signal?.addEventListener('abort', abort, { once: true })
    try {
      const reply = await future.done
      return { status: reply.content.status, timedOut }
    } catch (error) {
      if (timedOut) return { status: 'error', timedOut }
      throw error
    } finally {
      clearTimeout(timer)
      clearTimeout(stopping)
      signal?.removeEventListener('abort', abort)
      future.dispose()
    }
  }

  const sessionKernel = (session: Session, settings: ServerConnection.ISettings) => async (): Promise<Handle> => {
    const known = session.kernel ? await session.kernel.catch(() => undefined) : undefined
    if (known && !known.connection.isDisposed && known.connection.status !== 'dead') return known
    session.kernel = start(settings)
    session.kernel.catch(() => {
      session.kernel = undefined
    })
    return session.kernel
  }

  const transient = async (request: RunRequest, signal?: AbortSignal): Promise<RunResult> => {
    const started = Date.now()
    const settings = await settingsOrFail()
    if (!('baseUrl' in settings)) return settings
    let handle: Handle | undefined
    try {
      return await runIn(async () => (handle = await start(settings)), request, signal, settings, started)
    } finally {
      if (handle) await shutdown(handle).catch(error => {
        if (options.cleanupFailed) options.cleanupFailed(error)
        else console.warn('[presmium] Jupyter cleanup failed', error)
      })
    }
  }

  return {
    supports: lang => !options.languages || options.languages.some(l => languageId(l) === languageId(lang)),
    run(request, signal) {
      if (signal?.aborted) return Promise.resolve(fail(errorText(signal.reason)))
      if (disposed) return Promise.resolve(fail('the Jupyter environment has been disposed'))
      if (!request.session) return transient(request, signal)
      let session = sessions.get(request.session)
      if (!session) {
        session = { tail: Promise.resolve() }
        sessions.set(request.session, session)
      }
      const own = session
      const result = own.tail.then(async () => {
        const started = Date.now()
        const settings = await settingsOrFail()
        if (!('baseUrl' in settings)) return settings
        return runIn(sessionKernel(own, settings), request, signal, settings, started)
      })
      own.tail = result.catch(() => undefined)
      return result
    },
    async endSession(session) {
      const known = sessions.get(session)
      if (!known) return
      sessions.delete(session)
      await known.tail
      const handle = await known.kernel?.catch(() => undefined)
      if (handle) await shutdown(handle)
    },
    async describe() {
      const settings = await options.settings()
      const { ServerConnection } = await services()
      const response = await ServerConnection.makeRequest(`${settings.baseUrl}api/kernelspecs/${encodeURIComponent(options.kernel)}`, {}, settings)
      if (!response.ok) throw await ServerConnection.ResponseError.create(response)
      const spec: unknown = await response.json()
      const handle = await start(settings)
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
        await shutdown(handle)
      }
    },
    async probe() {
      try {
        const settings = await options.settings()
        const { names } = await kernelSpecs(settings)
        return names.includes(options.kernel) ? undefined : options.text.noKernel(options.kernel, names)
      } catch (error) {
        specs = undefined
        const status = statusOf(error)
        return status === 401 || status === 403 ? options.text.refused : options.text.unreachable(errorText(error))
      }
    },
    dispose() {
      if (disposing) return disposing
      disposed = true
      // Start all known shutdowns synchronously, including keepalive handoffs.
      const cleanup = [...live].map(handle => shutdown(handle))
      const pending = [...starting]
      sessions.clear()
      disposing = (async () => {
        const results = await Promise.allSettled(cleanup)
        await Promise.allSettled(pending)
        const failed = results.find(result => result.status === 'rejected')
        if (failed?.status === 'rejected') throw failed.reason
      })()
      return disposing
    },
  }
}

export async function shutdownKernel(kernel: string, directory: string, settings: ServerConnection.ISettings): Promise<void> {
  const { ServerConnection } = await services()
  const response = await ServerConnection.makeRequest(`${settings.baseUrl}api/kernels/${encodeURIComponent(kernel)}`, { method: 'DELETE', keepalive: true }, settings)
  if (response.status !== 204 && response.status !== 404) throw await ServerConnection.ResponseError.create(response)
  await removeDirectory(settings, directory)
}

async function removeDirectory(settings: ServerConnection.ISettings, path: string): Promise<void> {
  const { Drive } = await services()
  const drive = new Drive({ serverSettings: settings })
  const remove = async (dir: string): Promise<void> => {
    const model = await drive.get(dir, { content: true })
    for (const item of Array.isArray(model.content) ? model.content as { path: string, type: string }[] : []) {
      if (item.type === 'directory') await remove(item.path)
      else await drive.delete(item.path)
    }
    await drive.delete(dir)
  }
  try {
    await remove(path)
  } catch (error) {
    if (statusOf(error) !== 404) throw error
  } finally {
    drive.dispose()
  }
}

function connected(connection: Kernel.IKernelConnection): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => done(new Error(`no answer from the kernel within ${CONNECT_TIMEOUT_MS / 1000} s`)), CONNECT_TIMEOUT_MS)
    const watch = (_: unknown, status: string) => {
      if (status === 'disconnected') done(new Error('the kernel\'s WebSocket closed'))
    }
    const done = (error?: Error) => {
      clearTimeout(timer)
      connection.connectionStatusChanged.disconnect(watch)
      if (error) reject(error)
      else resolve()
    }
    connection.connectionStatusChanged.connect(watch)
    connection.info.then(() => done(), (error: unknown) => done(error instanceof Error ? error : new Error(String(error))))
  })
}
