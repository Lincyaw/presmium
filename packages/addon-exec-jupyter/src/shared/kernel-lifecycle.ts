import type { Kernel, ServerConnection } from '@jupyterlab/services'
import { RUNS_DIR } from '../domain/config.ts'
import { loadJupyterServices } from './load-services.ts'
import { responseStatus } from './refusal.ts'

const CONNECT_TIMEOUT_MS = 30_000

export interface JupyterKernelHandle {
  id: string
  dir: string
  connection: Kernel.IKernelConnection
}

export type ShutdownJupyterKernel = (kernel: string, directory: string, settings: ServerConnection.ISettings) => Promise<void>

export interface JupyterKernelLifecycle {
  readonly disposed: boolean
  start(settings: ServerConnection.ISettings): Promise<JupyterKernelHandle>
  shutdown(handle: JupyterKernelHandle): Promise<void>
  dispose(): Promise<void>
}

function randomId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * Starts kernels, each with its own directory under presmium-runs/, and shuts them down with their directory.
 * Disposing shuts down every kernel, those still starting too; `shutdown` can hand the shutdown to another party.
 */
export function createJupyterKernelLifecycle(options: { kernelName: string, shutdown?: ShutdownJupyterKernel }): JupyterKernelLifecycle {
  const live = new Set<JupyterKernelHandle>()
  const starting = new Set<Promise<JupyterKernelHandle>>()
  const shuttingDown = new Map<JupyterKernelHandle, Promise<void>>()
  let disposed = false
  let disposing: Promise<void> | undefined

  const start = (settings: ServerConnection.ISettings): Promise<JupyterKernelHandle> => {
    if (disposed) return Promise.reject(new Error('the Jupyter environment has been disposed'))
    const task = (async () => {
      const { Drive, KernelAPI, KernelConnection } = await loadJupyterServices()
      const dir = `${RUNS_DIR}/${randomId()}`
      const drive = new Drive({ serverSettings: settings })
      let handle: JupyterKernelHandle | undefined
      await drive.save(RUNS_DIR, { type: 'directory' })
      try {
        await drive.save(dir, { type: 'directory' })
        const model = await KernelAPI.startNew({ name: options.kernelName, path: `${dir}/kernel` } as { name: string }, settings)
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

  const shutdown = (handle: JupyterKernelHandle): Promise<void> => {
    const known = shuttingDown.get(handle)
    if (known) return known
    // Invoke the handoff before yielding: pagehide cannot wait for later continuations.
    const cleanup = (options.shutdown ?? shutdownJupyterKernel)(handle.id, handle.dir, handle.connection.serverSettings)
    handle.connection.dispose()
    const task = cleanup.finally(() => {
      live.delete(handle)
      shuttingDown.delete(handle)
    })
    shuttingDown.set(handle, task)
    return task
  }

  return {
    get disposed() {
      return disposed
    },
    start,
    shutdown,
    dispose() {
      if (disposing) return disposing
      disposed = true
      // Start all known shutdowns synchronously, including keepalive handoffs.
      const cleanup = [...live].map(handle => shutdown(handle))
      const pending = [...starting]
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

/** Shuts the kernel down and deletes its directory. */
export async function shutdownJupyterKernel(kernel: string, directory: string, settings: ServerConnection.ISettings): Promise<void> {
  const { ServerConnection } = await loadJupyterServices()
  const response = await ServerConnection.makeRequest(`${settings.baseUrl}api/kernels/${encodeURIComponent(kernel)}`, { method: 'DELETE', keepalive: true }, settings)
  if (response.status !== 204 && response.status !== 404) throw await ServerConnection.ResponseError.create(response)
  await removeDirectory(settings, directory)
}

async function removeDirectory(settings: ServerConnection.ISettings, path: string): Promise<void> {
  const { Drive } = await loadJupyterServices()
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
    if (responseStatus(error) !== 404) throw error
  } finally {
    drive.dispose()
  }
}

/** Why a connection to Jupyter failed, as a code a reader's text is chosen by (the message is for logs). */
export type JupyterFailure = 'jupyter-no-answer' | 'jupyter-closed'
const failure = (code: JupyterFailure, message: string) => Object.assign(new Error(message), { code })
export const failureCode = (error: unknown): JupyterFailure | undefined => {
  const code = (error as { code?: unknown } | undefined)?.code
  return code === 'jupyter-no-answer' || code === 'jupyter-closed' ? code : undefined
}

function connected(connection: Kernel.IKernelConnection): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => done(failure('jupyter-no-answer', `no answer from the kernel within ${CONNECT_TIMEOUT_MS / 1000} s`)), CONNECT_TIMEOUT_MS)
    const watch = (_: unknown, status: string) => {
      if (status === 'disconnected') done(failure('jupyter-closed', 'the kernel\'s WebSocket closed'))
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
